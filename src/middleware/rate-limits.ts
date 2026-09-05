import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

/**
 * Keys the limit to the logged-in user rather than their IP address.
 *
 * This matters more here than it might elsewhere: a school, coaching
 * centre, hostel or cyber cafe puts many students behind one IP. Rate
 * limiting by IP there would mean one active student locks out everyone
 * else on the same connection.
 *
 * Falls back to IP if there's somehow no user - these limiters only run
 * after requireAuth, so that shouldn't happen, but a limiter that
 * silently stops limiting would be worse than one that's occasionally
 * strict.
 */
function keyByUser(req: Request): string {
  if (req.user?.sub) return req.user.sub;

  /**
   * The library's own helper, not req.ip directly. An IPv6 user gets a
   * whole range of addresses, so keying on the raw address would let
   * them rotate through it and bypass the limit entirely. This
   * normalises to the subnet.
   */
  return ipKeyGenerator(req.ip ?? "unknown");
}

function tooMany(message: string) {
  return {
    ok: false,
    error: { code: "TOO_MANY_REQUESTS", message },
  };
}

/**
 * Login. Tight, because this is the one endpoint where guessing pays off -
 * without a limit, someone can work through thousands of passwords.
 * Five attempts per quarter hour is enough for a person who's genuinely
 * forgotten theirs, and useless for a script.
 *
 * Keyed by IP, not user - there's no logged-in user yet, and keying by
 * the submitted email would let an attacker rotate emails to reset it.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Don't count successful logins - only failures should push someone
  // towards the limit.
  skipSuccessfulRequests: true,
  message: tooMany("Too many login attempts. Please wait 15 minutes and try again."),
});

/**
 * Signup. Stops someone scripting thousands of accounts.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooMany("Too many accounts created from here. Please try again later."),
});

/**
 * Asking a question. Every one of these costs a real AI call, so this is
 * cost protection as much as abuse protection.
 *
 * The monthly allowance already caps total volume; this caps the rate.
 * Twenty in five minutes is far more than a student doing homework will
 * ever need, and far less than a script could manage.
 */
export const askLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: keyByUser,
  message: tooMany("You're sending questions very quickly. Please wait a moment."),
});

/**
 * File upload. The tightest of the lot, because it's the most expensive
 * thing in the system - a single upload can occupy the AI service's CPU
 * for minutes doing OCR. A handful of concurrent uploads would slow the
 * service down for everyone.
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: keyByUser,
  message: tooMany("You've uploaded several files recently. Please wait a few minutes."),
});