import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { getPlan } from "../config/plans";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireActivePlan, so the route doesn't re-query for it. */
      student?: { grade: number | null; examTrack: string };
    }
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Gate for asking a new question. Runs after requireAuth.
 *
 * Deliberately NOT applied to reading chats - a student who has paid
 * keeps access to their own conversation history even after their plan
 * lapses. Only asking something new needs an active plan.
 *
 * Also attaches grade/examTrack to the request. It already has to load
 * the user row, so pulling two more columns here is free, and saves the
 * route a second round-trip just to find out what class the student is in.
 */
export async function requireActivePlan(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Not authenticated" },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      grade: true,
      examTrack: true,
      planStatus: true,
      planCode: true,
      planExpiresAt: true,
      questionsUsed: true,
      usagePeriodStart: true,
    },
  });

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Not authenticated" },
    });
  }

  // Set before the admin check, so admins get tailored answers too.
  req.student = { grade: user.grade, examTrack: user.examTrack };

  // Admins are exempt entirely. Done as a role check rather than by
  // giving them a fake subscription row, so admin accounts never show
  // up in revenue or subscriber counts.
  if (user.role === "ADMIN") return next();

  const now = new Date();

  if (user.planStatus !== "ACTIVE") {
    return res.status(402).json({
      ok: false,
      error: { code: "NO_ACTIVE_PLAN", message: "You need an active plan to ask questions." },
    });
  }

  if (user.planExpiresAt && user.planExpiresAt <= now) {
    await prisma.user.update({ where: { id: userId }, data: { planStatus: "EXPIRED" } });
    return res.status(402).json({
      ok: false,
      error: {
        code: "PLAN_EXPIRED",
        message: "Your plan has expired. Renew it to keep asking questions.",
      },
    });
  }

  const plan = getPlan(user.planCode ?? "");
  if (!plan) {
    console.error(`Unknown planCode "${user.planCode}" on user ${userId}`);
    return res.status(500).json({
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong" },
    });
  }

  let questionsUsed = user.questionsUsed;
  const periodStart = user.usagePeriodStart ?? now;
  const periodEnd = addDays(periodStart, plan.durationDays);

  /**
   * Roll the period over lazily, on request, rather than relying only on
   * Razorpay's renewal webhook firing on time. If that webhook is delayed
   * or missed, a paid-up student would otherwise sit at their old limit
   * with no way out. This self-corrects.
   */
  if (now >= periodEnd) {
    questionsUsed = 0;
    await prisma.user.update({
      where: { id: userId },
      data: { questionsUsed: 0, usagePeriodStart: now },
    });
  }

  if (questionsUsed >= plan.questionLimit) {
    const resetsAt = addDays(user.usagePeriodStart ?? now, plan.durationDays);
    return res.status(403).json({
      ok: false,
      error: {
        code: "QUESTION_LIMIT_REACHED",
        message: `You've used all ${plan.questionLimit} questions for this period. Your allowance resets on ${resetsAt.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}.`,
      },
    });
  }

  next();
}