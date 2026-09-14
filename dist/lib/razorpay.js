"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRazorpay = getRazorpay;
exports.isValidWebhookSignature = isValidWebhookSignature;
const razorpay_1 = __importDefault(require("razorpay"));
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
/**
 * Created lazily rather than at import time, because the keys aren't set
 * yet - the founder's Razorpay access is still being arranged. Building
 * the client at startup would crash the whole server over a feature
 * nobody is using yet.
 */
let client = null;
function getRazorpay() {
    if (!env_1.env.RAZORPAY_KEY_ID || !env_1.env.RAZORPAY_KEY_SECRET)
        return null;
    if (!client) {
        client = new razorpay_1.default({
            key_id: env_1.env.RAZORPAY_KEY_ID,
            key_secret: env_1.env.RAZORPAY_KEY_SECRET,
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
function isValidWebhookSignature(rawBody, signature) {
    if (!env_1.env.RAZORPAY_WEBHOOK_SECRET)
        return false;
    const expected = crypto_1.default
        .createHmac("sha256", env_1.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const receivedBuf = Buffer.from(signature, "utf8");
    // Lengths must match before timingSafeEqual, which throws otherwise.
    if (expectedBuf.length !== receivedBuf.length)
        return false;
    // A plain === would leak information through how long the comparison
    // takes, letting an attacker guess the signature one character at a
    // time. This compares in constant time.
    return crypto_1.default.timingSafeEqual(expectedBuf, receivedBuf);
}
//# sourceMappingURL=razorpay.js.map