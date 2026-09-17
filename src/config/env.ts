import "dotenv/config";
import { z } from "zod";

/**
 * Validate environment once, at boot. If something required is missing,
 * the process fails immediately with a clear message instead of crashing
 * confusingly deep inside a request handler later.
 */
const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),

  AI_SERVICE_URL: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_EARLY_BIRD_PLAN_ID: z.string().optional(),
  RAZORPAY_STARTER_PLAN_ID: z.string().optional(),
  RAZORPAY_POPULAR_PLAN_ID: z.string().optional(),
  RAZORPAY_PRO_PLAN_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("onboarding@resend.dev"),
  APP_URL: z.string().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;