"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPasswordResetEmail = sendPasswordResetEmail;
const resend_1 = require("resend");
const env_1 = require("../config/env");
/**
 * Created lazily. The key may not be set in every environment, and
 * building the client at import time would crash the whole server over
 * a feature that isn't in use.
 */
let client = null;
function getResend() {
    if (!env_1.env.RESEND_API_KEY)
        return null;
    if (!client)
        client = new resend_1.Resend(env_1.env.RESEND_API_KEY);
    return client;
}
async function sendPasswordResetEmail(to, resetUrl) {
    const resend = getResend();
    /**
     * With no email provider configured, the link is logged instead of
     * sent. That keeps the whole flow testable locally, where the only
     * address Resend's test domain will deliver to is our own.
     *
     * This must never happen in production - a reset link in the server
     * logs is a reset link anyone with log access can use.
     */
    if (!resend) {
        console.warn("No RESEND_API_KEY set. Password reset link (development only):");
        console.warn(resetUrl);
        return true;
    }
    try {
        const { error } = await resend.emails.send({
            from: env_1.env.EMAIL_FROM,
            to,
            subject: "Reset your QRI password",
            text: [
                "You asked to reset your QRI password.",
                "",
                "Open this link to choose a new one:",
                resetUrl,
                "",
                "The link expires in 30 minutes.",
                "",
                "If you didn't ask for this, you can ignore this email - your password hasn't changed.",
            ].join("\n"),
        });
        if (error) {
            console.error("Failed to send password reset email:", error);
            return false;
        }
        return true;
    }
    catch (err) {
        console.error("Failed to send password reset email:", err);
        return false;
    }
}
//# sourceMappingURL=email.js.map