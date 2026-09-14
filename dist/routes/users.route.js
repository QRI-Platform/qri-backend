"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../db/prisma");
const auth_1 = require("../middleware/auth");
const plans_1 = require("../config/plans");
exports.usersRouter = (0, express_1.Router)();
exports.usersRouter.use(auth_1.requireAuth);
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}
/**
 * GET /api/users/me
 * The student's own profile, now including plan status and usage.
 *
 * Folded into this existing endpoint rather than adding a separate
 * /plan route: the profile page already calls this, and the chat page
 * needs the same information, so one call serves both.
 */
exports.usersRouter.get("/me", async (req, res) => {
    const userId = req.user.sub;
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            grade: true,
            examTrack: true,
            image: true,
            createdAt: true,
            planStatus: true,
            planCode: true,
            planExpiresAt: true,
            questionsUsed: true,
            usagePeriodStart: true,
        },
    });
    if (!user) {
        return res.status(404).json({
            ok: false,
            error: { code: "NOT_FOUND", message: "User not found" },
        });
    }
    const plan = (0, plans_1.getPlan)(user.planCode ?? "");
    // Admins have no plan and no limit - reported honestly rather than
    // pretending they're on some plan.
    const isAdmin = user.role === "ADMIN";
    res.json({
        ok: true,
        data: {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                grade: user.grade,
                examTrack: user.examTrack,
                image: user.image,
                createdAt: user.createdAt,
            },
            plan: {
                status: isAdmin ? "EXEMPT" : user.planStatus,
                code: user.planCode,
                name: plan?.name ?? null,
                expiresAt: user.planExpiresAt,
                questionsUsed: isAdmin ? 0 : user.questionsUsed,
                questionLimit: isAdmin ? null : (plan?.questionLimit ?? null),
                resetsAt: !isAdmin && plan && user.usagePeriodStart
                    ? addDays(user.usagePeriodStart, plan.durationDays)
                    : null,
            },
        },
    });
});
const updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    grade: zod_1.z.number().int().min(6).max(12).optional(),
    examTrack: zod_1.z.enum(["NEET", "IIT_JEE", "NDA", "NONE"]).optional(),
});
/**
 * PATCH /api/users/me
 * Updates whichever fields are provided. Plan fields are deliberately
 * not editable here - those only change through payment.
 */
exports.usersRouter.patch("/me", async (req, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            ok: false,
            error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid input" },
        });
    }
    if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({
            ok: false,
            error: { code: "BAD_REQUEST", message: "Provide at least one field to update" },
        });
    }
    const userId = req.user.sub;
    const user = await prisma_1.prisma.user.update({
        where: { id: userId },
        data: parsed.data,
    });
    res.json({
        ok: true,
        data: {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                grade: user.grade,
                examTrack: user.examTrack,
            },
        },
    });
});
//# sourceMappingURL=users.route.js.map