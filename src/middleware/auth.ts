import type { Request, Response, NextFunction } from "express";
import { verifyToken, type AuthTokenPayload } from "../lib/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

/**
 * Checks for a valid Bearer token on the request. If valid, attaches the
 * decoded payload to req.user so later handlers know who's asking.
 *
 * Not used by any route yet - register/login/oauth-sync are public
 * (anyone can hit them without already being logged in). This exists
 * ready for Day 4+, when we protect /api/chat, /api/profile, etc.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
    });
  }

  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    return res.status(401).json({
      ok: false,
      error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" },
    });
  }
}