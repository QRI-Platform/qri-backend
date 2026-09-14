"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../db/prisma");
const password_1 = require("../lib/password");
const jwt_1 = require("../lib/jwt");
const rate_limits_1 = require("../middleware/rate-limits");
const crypto_1 = __importDefault(require("crypto"));
const email_1 = require("../lib/email");
const env_1 = require("../config/env");
exports.authRouter = (0, express_1.Router)();
// ---------- Register ----------
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
exports.authRouter.post("/register", rate_limits_1.registerLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            ok: false,
            error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid input" },
        });
    }
    const { name, email, password } = parsed.data;
    const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (existing) {
        return res.status(409).json({
            ok: false,
            error: { code: "EMAIL_TAKEN", message: "An account with this email already exists" },
        });
    }
    const passwordHash = await (0, password_1.hashPassword)(password);
    const user = await prisma_1.prisma.user.create({
        data: { name, email, passwordHash, provider: "CREDENTIALS" },
    });
    const token = (0, jwt_1.signToken)({ sub: user.id, email: user.email, role: user.role });
    res.status(201).json({
        ok: true,
        data: { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } },
    });
});
// ---------- Login ----------
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.authRouter.post("/login", rate_limits_1.loginLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            ok: false,
            error: { code: "BAD_REQUEST", message: "Email and password are required" },
        });
    }
    const { email, password } = parsed.data;
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
        return res.status(401).json({
            ok: false,
            error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password" },
        });
    }
    const valid = await (0, password_1.verifyPassword)(password, user.passwordHash);
    if (!valid) {
        return res.status(401).json({
            ok: false,
            error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password" },
        });
    }
    const token = (0, jwt_1.signToken)({ sub: user.id, email: user.email, role: user.role });
    res.json({
        ok: true,
        data: { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } },
    });
});
// ---------- Google OAuth sync ----------
/**
 * Google sign-in is deferred to a later phase.
 *
 * The old /oauth-sync endpoint has been removed rather than left
 * unused. It accepted a name and email and issued a token for that
 * account with no verification of any kind - anyone could have posted
 * any email address and received a valid session for it. Harmless only
 * because nothing called it.
 *
 * When Google sign-in is built, it must verify Google's ID token
 * against Google's public keys server-side, and trust the email only
 * from that verified token. Never from the request body.
 */
// ---------- Password reset ----------
const RESET_TOKEN_TTL_MINUTES = 30;
/**
 * The raw token goes in the email; only its hash is stored. If the
 * database leaked, the stored hashes would be useless for logging in.
 */
function createResetToken() {
    const raw = crypto_1.default.randomBytes(32).toString("hex");
    const hash = crypto_1.default.createHash("sha256").update(raw).digest("hex");
    return { raw, hash };
}
function hashResetToken(raw) {
    return crypto_1.default.createHash("sha256").update(raw).digest("hex");
}
const forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
/**
 * POST /api/auth/forgot-password
 *
 * Always returns the same success response, whether or not the email
 * exists. Saying "no account with that email" would turn this endpoint
 * into a way to check which addresses are registered - useful to anyone
 * building a list to target.
 *
 * Rate limited with the login limiter: without one, this becomes a way
 * to send someone unlimited email.
 */
exports.authRouter.post("/forgot-password", rate_limits_1.loginLimiter, async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            ok: false,
            error: { code: "BAD_REQUEST", message: "A valid email is required" },
        });
    }
    const { email } = parsed.data;
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    // Only accounts with a password can reset one.
    if (user?.passwordHash) {
        const { raw, hash } = createResetToken();
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: {
                resetTokenHash: hash,
                resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
            },
        });
        await (0, email_1.sendPasswordResetEmail)(email, `${env_1.env.APP_URL}/reset-password?token=${raw}`);
    }
    res.json({
        ok: true,
        data: { message: "If that email has an account, a reset link is on its way." },
    });
});
const resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    password: zod_1.z.string().min(8),
});
/**
 * POST /api/auth/reset-password
 *
 * Note this does NOT log the student in afterwards. Anyone holding the
 * link could then take over the session directly. Making them log in
 * with the new password confirms they actually know it.
 */
exports.authRouter.post("/reset-password", async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            ok: false,
            error: {
                code: "BAD_REQUEST",
                message: parsed.error.issues[0]?.message ?? "Invalid input",
            },
        });
    }
    const { token, password } = parsed.data;
    const user = await prisma_1.prisma.user.findUnique({
        where: { resetTokenHash: hashResetToken(token) },
    });
    // Same message for an unknown token and an expired one - there's
    // nothing useful in telling them apart, and the fix is identical.
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt <= new Date()) {
        return res.status(400).json({
            ok: false,
            error: {
                code: "INVALID_TOKEN",
                message: "This reset link is invalid or has expired. Please request a new one.",
            },
        });
    }
    await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: {
            passwordHash: await (0, password_1.hashPassword)(password),
            // Cleared so the link can't be reused.
            resetTokenHash: null,
            resetTokenExpiresAt: null,
        },
    });
    res.json({ ok: true, data: { message: "Your password has been changed. Please log in." } });
});
//# sourceMappingURL=auth.route.js.map