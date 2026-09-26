import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { isSubjectAllowedForGrade, getSubject } from "../config/subjects";

declare global {
  namespace Express {
    interface Request {
      // Set by requireValidSubject so routes don't re-fetch it.
      gameContext?: {
        grade: number | null;
        examTrack: string;
        subjectCode: string;
      };
    }
  }
}

/**
 * Confirms the subject in the URL is real and offered to this student's
 * class.
 *
 * A guard rather than a check inside each route: every game endpoint
 * needs it, and forgetting it in one place would let a Class 6 student
 * type /game/physics into the address bar and practise a subject their
 * syllabus doesn't have.
 *
 * Runs after requireAuth.
 */
export async function requireValidSubject(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.sub;
  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Not authenticated" },
    });
  }

  const { subject } = req.params as { subject?: string };
  if (!subject || !getSubject(subject)) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "Subject not found" },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { grade: true, examTrack: true },
  });

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Not authenticated" },
    });
  }

  if (!isSubjectAllowedForGrade(subject, user.grade)) {
    // Same 404 as a subject that doesn't exist. There's nothing useful
    // in telling a student which subjects exist for other classes.
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "Subject not found" },
    });
  }

  req.gameContext = {
    grade: user.grade,
    examTrack: user.examTrack,
    subjectCode: subject,
  };

  next();
}