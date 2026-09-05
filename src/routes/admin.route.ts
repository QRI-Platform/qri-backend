import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";

export const adminRouter = Router();

// Order matters: prove they're logged in, then prove they're an admin.
adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

/**
 * GET /api/admin/stats
 * Numbers for the admin dashboard.
 *
 * All queries run in parallel via Promise.all rather than one after
 * another - awaiting each in turn would make this endpoint as slow as
 * the sum of every query instead of just the slowest one.
 */
adminRouter.get("/stats", async (_req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalStudents, newThisWeek, totalChats, totalMessages, byGrade, byExamTrack] =
    await Promise.all([
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.user.count({ where: { role: "STUDENT", createdAt: { gte: sevenDaysAgo } } }),
      prisma.chat.count(),
      prisma.message.count(),
      prisma.user.groupBy({
        by: ["grade"],
        where: { role: "STUDENT" },
        _count: true,
        orderBy: { grade: "asc" },
      }),
      prisma.user.groupBy({
        by: ["examTrack"],
        where: { role: "STUDENT" },
        _count: true,
      }),
    ]);

  res.json({
    ok: true,
    data: {
      totalStudents,
      newThisWeek,
      totalChats,
      totalMessages,
      byGrade: byGrade.map((g) => ({ grade: g.grade, count: g._count })),
      byExamTrack: byExamTrack.map((e) => ({ examTrack: e.examTrack, count: e._count })),
    },
  });
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Capped on purpose - without a ceiling, someone could ask for
  // limit=100000 and pull the entire user table in one request.
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

/**
 * GET /api/admin/students?page=1&limit=20&search=...
 * Paginated list of students.
 *
 * Never selects passwordHash - it should never leave the database,
 * not even to an admin.
 */
adminRouter.get("/students", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "BAD_REQUEST", message: "Invalid page, limit, or search value" },
    });
  }

  const { page, limit, search } = parsed.data;

  // `search` has no index behind it, so this is a full scan. Fine at
  // this scale; if the student list grows large enough for it to
  // matter, add an index (or Postgres full-text search) then.
  const where = {
    role: "STUDENT" as const,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [students, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        grade: true,
        examTrack: true,
        provider: true,
        createdAt: true,
        _count: { select: { chats: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    ok: true,
    data: {
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        grade: s.grade,
        examTrack: s.examTrack,
        provider: s.provider,
        createdAt: s.createdAt,
        chatCount: s._count.chats,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});