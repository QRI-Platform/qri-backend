"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadLimiter = exports.askLimiter = exports.registerLimiter = exports.loginLimiter = void 0;
const express_rate_limit_1 = __importStar(require("express-rate-limit"));
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
function keyByUser(req) {
    if (req.user?.sub)
        return req.user.sub;
    /**
     * The library's own helper, not req.ip directly. An IPv6 user gets a
     * whole range of addresses, so keying on the raw address would let
     * them rotate through it and bypass the limit entirely. This
     * normalises to the subnet.
     */
    return (0, express_rate_limit_1.ipKeyGenerator)(req.ip ?? "unknown");
}
function tooMany(message) {
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
exports.loginLimiter = (0, express_rate_limit_1.default)({
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
exports.registerLimiter = (0, express_rate_limit_1.default)({
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
exports.askLimiter = (0, express_rate_limit_1.default)({
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
exports.uploadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyByUser,
    message: tooMany("You've uploaded several files recently. Please wait a few minutes."),
});
//# sourceMappingURL=rate-limits.js.map