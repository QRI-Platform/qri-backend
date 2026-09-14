"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
/**
 * Validate environment once, at boot. If something required is missing,
 * the process fails immediately with a clear message instead of crashing
 * confusingly deep inside a request handler later.
 */
const schema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(4000),
    NODE_ENV: zod_1.z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required"),
    WEB_ORIGIN: zod_1.z.string().default("http://localhost:3000"),
    AUTH_SECRET: zod_1.z.string().min(1, "AUTH_SECRET is required"),
    AI_SERVICE_URL: zod_1.z.string().optional(),
    RAZORPAY_KEY_ID: zod_1.z.string().optional(),
    RAZORPAY_KEY_SECRET: zod_1.z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: zod_1.z.string().optional(),
    RESEND_API_KEY: zod_1.z.string().optional(),
    EMAIL_FROM: zod_1.z.string().default("onboarding@resend.dev"),
    APP_URL: zod_1.z.string().default("http://localhost:3000"),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    console.error("Invalid environment variables:\n", parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
//# sourceMappingURL=env.js.map