import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/plan";
import { env } from "../config/env";
import { uploadLimiter } from "../middleware/rate-limits";

export const uploadsRouter = Router();

uploadsRouter.use(requireAuth);

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt", ".png", ".jpg", ".jpeg", ".webp"];

/**
 * Files are held in memory, never written to disk. We forward them
 * straight to the AI service and keep nothing - see docs/DECISIONS.md.
 * Memory is fine at this size limit; it would not be for large video.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
});

/**
 * Multer reports its own limits (size, count) by passing an error to
 * next(), which lands in the global error handler and comes back as a
 * generic 500 - even though the request was rejected deliberately.
 * Catching them here turns them into clear 400s the student can act on.
 */
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.array("files", MAX_FILES)(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          ok: false,
          error: {
            code: "FILE_TOO_LARGE",
            message: `That file is too large. The limit is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
          },
        });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          ok: false,
          error: {
            code: "TOO_MANY_FILES",
            message: `You can upload up to ${MAX_FILES} files at a time.`,
          },
        });
      }
      return res.status(400).json({
        ok: false,
        error: { code: "UPLOAD_FAILED", message: "That file couldn't be uploaded." },
      });
    }
    if (err) return next(err);
    next();
  });
}

/**
 * POST /api/chats/:id/upload
 *
 * Sends the student's files to the AI developer's /ingest endpoint,
 * which parses them (including OCR for images) and stores the chunks in
 * a Pinecone namespace keyed by thread_id.
 *
 * Note this does NOT produce an answer - ingest only indexes. The
 * student asks a question afterwards, and /chat retrieves from what was
 * just indexed. Their docs are explicit about this split.
 *
 * requireActivePlan runs here so a lapsed student can't use uploads
 * either, but uploading deliberately does NOT increment questionsUsed -
 * the founder's plan is "150 questions", and charging one for the
 * upload plus another for the question that follows would mean a single
 * photo costs two.
 */
uploadsRouter.post(
  "/:id/upload",
  requireActivePlan,
  uploadLimiter,
  handleUpload,
  async (req, res) => {
    const userId = req.user!.sub;
    const { id } = req.params as { id: string };

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { code: "BAD_REQUEST", message: "No file was uploaded" },
      });
    }

    const badFile = files.find(
      (f) => !ALLOWED_EXTENSIONS.some((ext) => f.originalname.toLowerCase().endsWith(ext)),
    );
    if (badFile) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "UNSUPPORTED_FILE",
          message: `"${badFile.originalname}" isn't a supported file type. Upload a PDF, document, or image.`,
        },
      });
    }

    // Same ownership check as every other chat route.
    const chat = await prisma.chat.findUnique({ where: { id } });
    if (!chat || chat.userId !== userId) {
      return res.status(404).json({
        ok: false,
        error: { code: "NOT_FOUND", message: "Chat not found" },
      });
    }

    if (!env.AI_SERVICE_URL) {
      return res.status(503).json({
        ok: false,
        error: { code: "AI_UNAVAILABLE", message: "File uploads aren't available right now." },
      });
    }

    const controller = new AbortController();
       // 5 minutes. OCR runs on CPU on their side and a large scanned image
    // genuinely took over four. The frontend shrinks photos before
    // sending, which should keep most uploads well under this - but
    // timing out early is worse than waiting, because their work
    // completes anyway and the file ends up indexed while the student
    // has been told it failed.
    const timeout = setTimeout(() => controller.abort(), 300_000);

    try {
      const form = new FormData();
      for (const file of files) {
        // Their field name is "files", repeated once per file.
        form.append(
          "files",
          new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
          file.originalname,
        );
      }

      const url = new URL("/api/v1/graph/ingest", env.AI_SERVICE_URL);
      url.searchParams.set("user_id", userId);
      url.searchParams.set("thread_id", id);

      const response = await fetch(url.toString(), {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error(`Ingest failed (${response.status}):`, detail.slice(0, 500));
        return res.status(502).json({
          ok: false,
          error: {
            code: "INGEST_FAILED",
            message: "Couldn't process that file just now. Please try again in a moment.",
          },
        });
      }

      // Their response shape isn't documented, so nothing is read from
      // it - a 2xx is treated as success. Logged so we can see what it
      // actually returns and tighten this later.
      const body = await response.text().catch(() => "");
      console.log(`Ingest ok: ${files.length} file(s), response: ${body.slice(0, 300)}`);

      const uploadedMessages = await prisma.$transaction(async (tx) => {
        const messages = await Promise.all(
          files.map((file) =>
            tx.message.create({
              data: {
                chatId: id,
                role: "SYSTEM",
                content: `user uploaded document: ${file.originalname}`,
              },
            }),
          ),
        );

        await tx.chat.update({ where: { id }, data: { updatedAt: new Date() } });
        return messages;
      });

      res.status(201).json({
        ok: true,
        data: {
          files: files.map((f) => ({ name: f.originalname, size: f.size })),
          messages: uploadedMessages,
        },
      });
    } catch (err) {
      console.error("Ingest call failed:", err);
      res.status(502).json({
        ok: false,
        error: {
          code: "INGEST_FAILED",
          message: "Couldn't process that file just now. Please try again in a moment.",
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  },
);