import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { requireActivePlan } from "../middleware/plan";
import { requireValidSubject } from "../middleware/game";
import { z } from "zod";
import { difficultyForLevel, QUESTIONS_PER_LEVEL } from "../config/subjects";
import { generateQuestions } from "../lib/quiz-generator";
import {
  subjectsForGrade,
  getSubject,
  highestBadge,
  badgesForProgress,
  TOTAL_LEVELS,
} from "../config/subjects";

export const gameRouter = Router();

/**
 * A plan is required to practise, but quiz questions deliberately do
 * NOT count against the monthly allowance - the founder's decision.
 * requireActivePlan only checks; the counter is incremented in the chat
 * route, so nothing here touches it.
 */
gameRouter.use(requireAuth);
gameRouter.use(requireActivePlan);

function accuracy(correct: number, answered: number): number {
  if (answered === 0) return 0;
  return Math.round((correct / answered) * 100);
}

/**
 * GET /api/game/subjects
 *
 * Subjects this student's class offers, each with their progress.
 * Powers both the subject-select screen and the dashboard cards.
 */
gameRouter.get("/subjects", async (req, res) => {
  const userId = req.user!.sub;
  const grade = req.student?.grade ?? null;

  const available = subjectsForGrade(grade);

  // One query for every subject rather than one per subject.
  const progressRows = await prisma.gameProgress.findMany({
    where: { userId },
    select: {
      subject: true,
      levelsCompleted: true,
      totalCorrect: true,
      totalAnswered: true,
      lastPlayedAt: true,
    },
  });

  const progressBySubject = new Map(progressRows.map((row) => [row.subject, row]));

  const subjects = available.map((subject) => {
    const progress = progressBySubject.get(subject.code);
    const levelsCompleted = progress?.levelsCompleted ?? 0;

    return {
      code: subject.code,
      name: subject.name,
      levelsCompleted,
      totalLevels: TOTAL_LEVELS,
      // The next level to play. Never exceeds the last one, so a
      // student who finishes everything stays on level 50 rather than
      // being offered a level 51 that doesn't exist.
      currentLevel: Math.min(levelsCompleted + 1, TOTAL_LEVELS),
      accuracyPercent: accuracy(progress?.totalCorrect ?? 0, progress?.totalAnswered ?? 0),
      highestBadge: highestBadge(levelsCompleted),
      lastPlayedAt: progress?.lastPlayedAt ?? null,
    };
  });

  res.json({ ok: true, data: { subjects } });
});

/**
 * GET /api/game/levels/:subject
 *
 * The level map: all 50 levels, which are done, which is current, and
 * which are still locked.
 */
gameRouter.get("/levels/:subject", requireValidSubject, async (req, res) => {
  const userId = req.user!.sub;
  const subjectCode = req.gameContext!.subjectCode;
  const subject = getSubject(subjectCode)!;

  const progress = await prisma.gameProgress.findUnique({
    where: { userId_subject: { userId, subject: subjectCode } },
    select: { levelsCompleted: true, totalCorrect: true, totalAnswered: true },
  });

  const levelsCompleted = progress?.levelsCompleted ?? 0;
  const currentLevel = Math.min(levelsCompleted + 1, TOTAL_LEVELS);

  /**
   * Best accuracy per completed level, for the map. Taken from the
   * attempts themselves rather than stored, since a level can be
   * replayed and the best result is what should show.
   */
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, subject: subjectCode, status: "COMPLETED" },
    select: { level: true, accuracyPercent: true },
  });

  const bestByLevel = new Map<number, number>();
  for (const attempt of attempts) {
    const best = bestByLevel.get(attempt.level) ?? 0;
    if ((attempt.accuracyPercent ?? 0) > best) {
      bestByLevel.set(attempt.level, attempt.accuracyPercent ?? 0);
    }
  }

  const levels = Array.from({ length: TOTAL_LEVELS }, (_, index) => {
    const level = index + 1;
    return {
      level,
      // Every completed level, plus the one after it.
      unlocked: level <= levelsCompleted + 1,
      completed: level <= levelsCompleted,
      isCurrent: level === currentLevel,
      accuracyPercent: bestByLevel.get(level) ?? null,
      // Badge milestones, marked every tenth level.
      badgeAtThisLevel: level % 10 === 0,
    };
  });

  res.json({
    ok: true,
    data: {
      subject: { code: subject.code, name: subject.name },
      levelsCompleted,
      currentLevel,
      totalLevels: TOTAL_LEVELS,
      accuracyPercent: accuracy(progress?.totalCorrect ?? 0, progress?.totalAnswered ?? 0),
      badges: badgesForProgress(levelsCompleted),
      levels,
    },
  });
});
const startSchema = z.object({
  level: z.number().int().min(1).max(TOTAL_LEVELS),
});

/**
 * POST /api/game/start/:subject
 *
 * Prepares a quiz for one level and returns the questions - **without
 * the correct answers**. Those stay in the database and are only used
 * when the attempt is submitted. Sending them to the browser would make
 * every level and badge meaningless, since they'd be readable from the
 * page.
 */
gameRouter.post("/start/:subject", requireValidSubject, async (req, res) => {
  const userId = req.user!.sub;
  const { subjectCode, examTrack } = req.gameContext!;

  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "BAD_REQUEST", message: "A valid level is required." },
    });
  }

  const { level } = parsed.data;

  const progress = await prisma.gameProgress.findUnique({
    where: { userId_subject: { userId, subject: subjectCode } },
    select: { levelsCompleted: true },
  });
  const levelsCompleted = progress?.levelsCompleted ?? 0;

  /**
   * Checked on the server, not just hidden in the level map. Without
   * this a student could post level 50 straight away and collect every
   * badge without playing.
   */
  if (level > levelsCompleted + 1) {
    return res.status(403).json({
      ok: false,
      error: { code: "LEVEL_LOCKED", message: "Finish the earlier levels first." },
    });
  }

  /**
   * If they already have this level open, hand back the same questions
   * rather than generating new ones. A refresh mid-quiz shouldn't lose
   * their place, and regenerating would cost another AI call.
   */
  const existing = await prisma.quizAttempt.findFirst({
    where: { userId, subject: subjectCode, level, status: "IN_PROGRESS" },
    include: { questions: { orderBy: { position: "asc" } } },
  });

  if (existing && existing.questions.length > 0) {
    return res.json({
      ok: true,
      data: {
        attemptId: existing.id,
        level: existing.level,
        resumed: true,
        questions: existing.questions.map((q) => ({
          id: q.id,
          position: q.position,
          questionText: q.questionText,
          options: q.options,
          selectedOption: q.selectedOption,
        })),
      },
    });
  }

  const difficulty = difficultyForLevel(level);

  // Deliberately outside any transaction - this can take a while, and
  // holding a database transaction open across a network call is a
  // rule we don't break.
  const generated = await generateQuestions({
    subject: subjectCode,
    difficulty,
    count: QUESTIONS_PER_LEVEL,
    examTrack,
    userId,
  });

  if (!generated.ok) {
    return res.status(502).json({
      ok: false,
      error: { code: "GENERATION_FAILED", message: generated.error ?? "Couldn't prepare the questions." },
    });
  }

  const attempt = await prisma.quizAttempt.create({
    data: {
      userId,
      subject: subjectCode,
      level,
      difficulty,
      totalQuestions: generated.questions.length,
      questions: {
        create: generated.questions.map((q, index) => ({
          position: index,
          questionText: q.questionText,
          options: q.options,
          correctOption: q.correctOption,
          explanation: q.explanation,
          hint: q.hint,
        })),
      },
    },
    include: { questions: { orderBy: { position: "asc" } } },
  });

  res.status(201).json({
    ok: true,
    data: {
      attemptId: attempt.id,
      level: attempt.level,
      resumed: false,
      // Note what's absent: correctOption and explanation. Neither
      // leaves the server until the attempt is submitted.
      questions: attempt.questions.map((q) => ({
        id: q.id,
        position: q.position,
        questionText: q.questionText,
        options: q.options,
        selectedOption: null,
      })),
    },
  });
});