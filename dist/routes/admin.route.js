"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../db/prisma");
const auth_1 = require("../middleware/auth");
const admin_1 = require("../middleware/admin");
exports.adminRouter = (0, express_1.Router)();
// Order matters: prove they're logged in, then prove they're an admin.
exports.adminRouter.use(auth_1.requireAuth);
exports.adminRouter.use(admin_1.requireAdmin);
/**
 * GET /api/admin/stats
 * Numbers for the admin dashboard.
 *
 * All queries run in parallel via Promise.all rather than one after
 * another - awaiting each in turn would make this endpoint as slow as
 * the sum of every query instead of just the slowest one.
 */
exports.adminRouter.get("/stats", async (_req, res) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [totalStudents, newThisWeek, totalChats, totalMessages, byGrade, byExamTrack] = await Promise.all([
        prisma_1.prisma.user.count({ where: { role: "STUDENT" } }),
        prisma_1.prisma.user.count({ where: { role: "STUDENT", createdAt: { gte: sevenDaysAgo } } }),
        prisma_1.prisma.chat.count(),
        prisma_1.prisma.message.count(),
        prisma_1.prisma.user.groupBy({
            by: ["grade"],
            where: { role: "STUDENT" },
            _count: true,
            orderBy: { grade: "asc" },
        }),
        prisma_1.prisma.user.groupBy({
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
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    // Capped on purpose - without a ceiling, someone could ask for
    // limit=100000 and pull the entire user table in one request.
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    search: zod_1.z.string().trim().optional(),
});
/**
 * GET /api/admin/students?page=1&limit=20&search=...
 * Paginated list of students.
 *
 * Never selects passwordHash - it should never leave the database,
 * not even to an admin.
 */
exports.adminRouter.get("/students", async (req, res) => {
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
        role: "STUDENT",
        ...(search
            ? {
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                ],
            }
            : {}),
    };
    const [students, total] = await Promise.all([
        prisma_1.prisma.user.findMany({
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
        prisma_1.prisma.user.count({ where }),
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
//# sourceMappingURL=admin.route.js.map