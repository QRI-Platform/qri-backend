import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env";

/**
 * Created lazily rather than at import time, because the keys aren't set
 * yet - the founder's Razorpay access is still being arranged. Building
 * the client at startup would crash the whole server over a feature
 * nobody is using yet.
 */
let client: Razorpay | null = null;

export function getRazorpay(): Razorpay | null {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return null;
  if (!client) {
    client = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
}

/**
 * Confirms a webhook genuinely came from Razorpay.
 *
 * This is the single most security-critical function in the payment
 * flow. The webhook endpoint has no login behind it - it can't, since
 * Razorpay's servers call it, not a student's browser. Without this
 * check, anyone who found the URL could POST a fake "payment succeeded"
 * event and grant themselves a paid plan.
 *
 * The signature is computed over the EXACT raw bytes Razorpay sent. Once
 * express.json() has parsed and re-serialised the body, key order and
 * whitespace can differ and the signature will never match - which is
 * why app.ts captures the raw buffer separately.
 */
export function isValidWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;

  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(signature, "utf8");

  // Lengths must match before timingSafeEqual, which throws otherwise.
  if (expectedBuf.length !== receivedBuf.length) return false;

  // A plain === would leak information through how long the comparison
  // takes, letting an attacker guess the signature one character at a
  // time. This compares in constant time.
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}