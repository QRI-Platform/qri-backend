import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/plan";
import { env } from "../config/env";
import { askLimiter } from "../middleware/rate-limits";

export const chatsRouter = Router();

// Every route below requires a valid token. Note requireActivePlan is
// NOT applied here - it's attached only to asking a new question, so
// reading past conversations keeps working after a plan lapses.
chatsRouter.use(requireAuth);

/**
 * POST /api/chats
 * Creates a new, empty chat for the logged-in student.
 */
chatsRouter.post("/", async (req, res) => {
  const userId = req.user!.sub;

  const chat = await prisma.chat.create({
    data: { userId, title: "New chat" },
  });

  res.status(201).json({ ok: true, data: { chat } });
});

/**
 * GET /api/chats
 * Lists the logged-in student's own chats, most recently active first.
 */
chatsRouter.get("/", async (req, res) => {
  const userId = req.user!.sub;

  const chats = await prisma.chat.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, subject: true, createdAt: true, updatedAt: true },
  });

  res.json({ ok: true, data: { chats } });
});

/**
 * GET /api/chats/:id
 * Loads one chat with its full message history, in order.
 */
chatsRouter.get("/:id", async (req, res) => {
  const userId = req.user!.sub;
  const { id } = req.params;

  const chat = await prisma.chat.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!chat || chat.userId !== userId) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "Chat not found" },
    });
  }

  res.json({ ok: true, data: { chat } });
});


/**
 * Defensive cleanup for a known fault on the AI service's side.
 *
 * Their model emits a JSON envelope like
 * {"response": "...", "memory_key": null, "memory_value": null}
 * and their extraction sometimes passes the whole thing through in
 * `final.ai_response` instead of just the prose inside it. Seen in two
 * of three answers during Day 12 testing - too frequent to show
 * students while they fix it on their end.
 *
 * Matched narrowly: all three keys, at the very end of the text. A
 * genuine answer that happens to contain JSON - a computer-science
 * question, say - won't match all three and is left alone.
 *
 * Remove this once their extraction is fixed.
 */
function stripModelEnvelope(text: string): string {
  const trimmed = text.trim();

  // Case 1: the whole reply is the envelope, with no prose at all.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as { response?: unknown };
      if (typeof parsed.response === "string" && parsed.response.trim()) {
        return parsed.response.trim();
      }
    } catch {
      // Not valid JSON after all - fall through and return as-is.
    }
  }

  // Case 2: real prose, with the envelope stuck on the end.
  const start = trimmed.lastIndexOf('{"response"');
  if (start > 0) {
    const tail = trimmed.slice(start);
    if (tail.endsWith("}") && tail.includes('"memory_key"') && tail.includes('"memory_value"')) {
      const cleaned = trimmed.slice(0, start).trim();
      if (cleaned) {
        console.warn("Stripped a leaked JSON envelope from the AI answer");
        return cleaned;
      }
    }
  }

  return trimmed;
}

/**
 * Calls the AI developer's endpoint and reads their Server-Sent Events
 * stream to completion.
 *
 * Their stream carries three event types, each on a `data:` line (no
 * space after the colon):
 *   token - one token at a time, for live streaming
 *   final - the complete answer in `ai_response`
 *   error - a failure, delivered inside a 200 response
 *
 * We read the `final` event and ignore the tokens. That matters: the
 * token stream is the model's *raw JSON output*, not clean prose -
 * concatenating the tokens yields
 * `{"response": "...", "memory_key": null, ...}` rather than an answer.
 * Only `final.ai_response` is the extracted, presentable text.
 *
 * Returns whether it worked, not just text, because a failed answer
 * must not count against the student's monthly allowance.
 */
async function callAiService(
  message: string,
  userId: string,
  threadId: string,
): Promise<{ ok: boolean; text: string }> {
  if (!env.AI_SERVICE_URL) {
    return {
      ok: false,
      text: "The AI service isn't connected yet - waiting on the AI developer's endpoint URL.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let finalAnswer: string | null = null;
  let serviceError: string | null = null;

  function handleLine(line: string) {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload) return;

    try {
      const event = JSON.parse(payload) as {
        type?: string;
        ai_response?: string;
        message?: string;
      };
      if (event.type === "error") {
        serviceError = event.message ?? "Unknown error from AI service";
      } else if (event.type === "final" && typeof event.ai_response === "string") {
        finalAnswer = stripModelEnvelope(event.ai_response);
      }
    } catch {
      // A malformed line isn't worth failing the whole answer over.
    }
  }

  try {
    const url = new URL("/api/v1/graph/chat", env.AI_SERVICE_URL);
    url.searchParams.set("user_id", userId);
    url.searchParams.set("thread_id", threadId);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`AI service responded with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // The last piece may be a half-received line - hold it back until
      // the rest of it arrives in a later chunk.
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    }

    // Whatever was left when the stream closed.
    if (buffer.trim()) handleLine(buffer);

    if (serviceError) {
      console.error("AI service returned an error event:", serviceError);
      return {
        ok: false,
        text: "Sorry, I couldn't generate an answer just now. Please try again in a moment.",
      };
    }

    if (!finalAnswer) {
      console.error("AI service stream ended without a final answer");
      return {
        ok: false,
        text: "Sorry, I couldn't generate an answer just now. Please try again in a moment.",
      };
    }

    return { ok: true, text: finalAnswer };
  } catch (err) {
    console.error("AI service call failed:", err);
    return {
      ok: false,
      text: "Sorry, I couldn't reach the AI service just now. Please try again in a moment.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

const EXAM_LABELS: Record<string, string> = {
  NEET: "NEET",
  IIT_JEE: "IIT-JEE",
  NDA: "NDA",
};

/**
 * Prefixes the student's class and exam track onto the question before
 * it goes to the AI.
 *
 * Their API only accepts { message, user_id, thread_id } - there's no
 * field for grade or exam track - so this is the only way to make a
 * Class 6 answer differ from a NEET-level one without waiting on a
 * change to their service. Worth revisiting if they add real
 * parameters for it later.
 *
 * The prefix is sent to the AI only. What gets saved as the student's
 * message is exactly what they typed.
 */
function withStudentContext(
  message: string,
  student?: { grade: number | null; examTrack: string },
): string {
  if (!student) return message;

  const parts: string[] = [];
  if (student.grade) parts.push(`a Class ${student.grade} student in India`);
  if (student.examTrack && student.examTrack !== "NONE") {
    parts.push(`preparing for ${EXAM_LABELS[student.examTrack] ?? student.examTrack}`);
  }

  if (parts.length === 0) return message;

  return `[Context: the person asking is ${parts.join(", ")}. Answer at a level suited to them, with enough explanation to actually learn from - not a single sentence.]\n\n${message}`;
}

const sendMessageSchema = z.object({
  content: z.string().min(1),
});

/**
 * POST /api/chats/:id/messages
 * The one route that needs an active plan.
 */
chatsRouter.post("/:id/messages", requireActivePlan, askLimiter, async (req, res) => {
  const userId = req.user!.sub;
// Express types this as string | string[] here (a quirk of the
  // overload picked when an extra middleware is passed). A path
  // parameter is always a single string, so narrowing is safe.
  const { id } = req.params as { id: string };
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "BAD_REQUEST", message: "Message content is required" },
    });
  }

  const chat = await prisma.chat.findUnique({ where: { id } });
  if (!chat || chat.userId !== userId) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "Chat not found" },
    });
  }

  const userMessage = await prisma.message.create({
    data: { chatId: id, role: "USER", content: parsed.data.content },
  });

const startedAt = Date.now();
  const reply = await callAiService(
    withStudentContext(parsed.data.content, req.student),
    userId,
    id,
  );
  console.log(
    `AI answer: ${Date.now() - startedAt}ms, ok=${reply.ok}, user=${userId}, chars=${reply.text.length}`,
  );
/**
   * All three writes happen together, or none do. An interactive
   * transaction is used rather than an array so the conditional
   * increment reads naturally - the counter only goes up when the
   * student actually got an answer. Charging someone a question for an
   * error would be unfair, and would also mean an outage on the AI side
   * silently eats paid allowance.
   *
   * Safe to hold a transaction open here: the slow part (the AI call)
   * already finished above, so these are just fast local writes.
   */
  const assistantMessage = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: { chatId: id, role: "ASSISTANT", content: reply.text, source: "AI" },
    });

    await tx.chat.update({ where: { id }, data: { updatedAt: new Date() } });

    if (reply.ok) {
      await tx.user.update({
        where: { id: userId },
        data: { questionsUsed: { increment: 1 } },
      });
    }

    return message;
  });

  res.status(201).json({ ok: true, data: { userMessage, assistantMessage } });
});

/**
 * Calls the AI service and forwards each token as it arrives, instead
 * of waiting for the whole answer.
 *
 * onToken gets each piece; the return value is the complete text (from
 * the final event, which is the clean version - the token stream is the
 * model's raw JSON output, not prose).
 */
async function streamAiService(
  message: string,
  userId: string,
  threadId: string,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<{ ok: boolean; text: string }> {
  if (!env.AI_SERVICE_URL) {
    return { ok: false, text: "The AI service isn't connected yet." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let finalAnswer: string | null = null;
  let streamedText = "";
  let serviceError: string | null = null;

  function handleLine(line: string) {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload) return;

    try {
      const event = JSON.parse(payload) as Record<string, unknown>;

      if (event.type === "error") {
        serviceError = typeof event.message === "string" ? event.message : "Unknown error from AI service";
        onEvent(event);
      } else if (event.type === "token" && typeof event.content === "string") {
        streamedText += event.content;
        onEvent(event);
      } else if (event.type === "reasoning") {
        onEvent(event);
      } else if (event.type === "tool_start" || event.type === "tool_end") {
        onEvent(event);
      } else if (event.type === "final" && typeof event.ai_response === "string") {
        finalAnswer = stripModelEnvelope(event.ai_response);
        onEvent(event);
      }
    } catch {
      // A malformed line isn't worth failing the whole answer over.
    }
  }

  try {
    const url = new URL("/api/v1/graph/chat", env.AI_SERVICE_URL);
    url.searchParams.set("user_id", userId);
    url.searchParams.set("thread_id", threadId);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`AI service responded with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    }
    if (buffer.trim()) handleLine(buffer);

    if (serviceError) {
      console.error("AI service returned an error event:", serviceError);
      return { ok: false, text: "Sorry, I couldn't generate an answer just now." };
    }

    /**
     * Prefer the final event - it's the extracted, clean answer. Fall
     * back to the concatenated tokens only if it never arrived, since
     * showing the student something they already watched appear beats
     * showing nothing.
     */
    const text = finalAnswer ?? streamedText.trim();
    if (!text) {
      return { ok: false, text: "Sorry, I couldn't generate an answer just now." };
    }

    return { ok: true, text };
  } catch (err) {
    console.error("AI service call failed:", err);
    return { ok: false, text: "Sorry, I couldn't reach the AI service just now." };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * POST /api/chats/:id/messages/stream
 *
 * Same as the non-streaming route, but sends the answer as it's
 * written. The old route is kept as a fallback.
 *
 * Everything that could fail is checked BEFORE the first byte goes out.
 * Once a response has started streaming, the status code is already
 * sent and can't be changed - so a later failure has to travel inside
 * the stream as an event. The AI developer hit exactly this bug
 * ("response already started"); this route is shaped to avoid it.
 */
chatsRouter.post("/:id/messages/stream", requireActivePlan, askLimiter, async (req, res) => {
  const userId = req.user!.sub;
  const { id } = req.params as { id: string };

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "BAD_REQUEST", message: "Message content is required" },
    });
  }

  const chat = await prisma.chat.findUnique({ where: { id } });
  if (!chat || chat.userId !== userId) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "Chat not found" },
    });
  }

  const userMessage = await prisma.message.create({
    data: { chatId: id, role: "USER", content: parsed.data.content },
  });

  req.socket.setNoDelay(true);
  req.socket.setTimeout(0);
  res.socket?.setNoDelay(true);

  // From here on the response is a stream. No more status codes.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  function send(event: Record<string, unknown>) {
    res.write(`data:${JSON.stringify(event)}\n\n`);
    if (typeof (res as any).flush === "function") {
      (res as any).flush();
    }
  }

  send({ type: "start", userMessageId: userMessage.id });

  const reply = await streamAiService(
    withStudentContext(parsed.data.content, req.student),
    userId,
    id,
    (event) => {
      send(event);
    },
  );

  const assistantMessage = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { chatId: id, role: "ASSISTANT", content: reply.text, source: "AI" },
    });
    await tx.chat.update({ where: { id }, data: { updatedAt: new Date() } });
    if (reply.ok) {
      await tx.user.update({
        where: { id: userId },
        data: { questionsUsed: { increment: 1 } },
      });
    }
    return created;
  });

  /**
   * The final text is sent even though tokens were already streamed.
   * They aren't the same thing - the tokens are raw model output, the
   * final is the extracted answer - so the client replaces what it
   * showed with this.
   */
  send({
    type: "done",
    ok: reply.ok,
    assistantMessageId: assistantMessage.id,
    content: reply.text,
  });

  res.end();
});

/**
 * DELETE /api/chats/:id
 */
chatsRouter.delete("/:id", async (req, res) => {
  const userId = req.user!.sub;
  const { id } = req.params;

  const chat = await prisma.chat.findUnique({ where: { id } });
  if (!chat || chat.userId !== userId) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "Chat not found" },
    });
  }

  await prisma.chat.delete({ where: { id } });

  res.json({ ok: true, data: { deleted: true } });
});