import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";

/**
 * Second layer of protection, used *after* requireAuth. requireAuth
 * only proves someone is logged in - it says nothing about whether
 * they're allowed to see every student's data.
 *
 * Note this deliberately re-reads the role from the database instead
 * of trusting `req.user.role` from the token. Tokens last 7 days, so
 * if an admin were demoted, their existing token would keep claiming
 * ADMIN until it expired. For ordinary routes that staleness is
 * harmless; for routes that expose every student's data it isn't. The
 * cost is one extra query per admin request, which is fine - these
 * routes are low-traffic by nature.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.sub;

  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Not authenticated" },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role !== "ADMIN") {
    // Same 403 whether the user doesn't exist or simply isn't an admin -
    // no reason to help someone map out which accounts exist.
    return res.status(403).json({
      ok: false,
      error: { code: "FORBIDDEN", message: "Admin access required" },
    });
  }

  next();
}