"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = notFound;
exports.errorHandler = errorHandler;
const env_1 = require("../config/env");
/** 404 fallthrough - reached only if no route above it matched. */
function notFound(_req, res) {
    res.status(404).json({
        ok: false,
        error: { code: "NOT_FOUND", message: "Route not found" },
    });
}
/**
 * Central error handler - the one place errors get shaped for the client.
 *
 * The full error is always logged server-side, but only echoed back to
 * the client in development. Prisma's error messages include the failing
 * query, the source file path, and the database hostname - all genuinely
 * useful while developing, and all things that should never reach a
 * browser in production.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(err, _req, res, _next) {
    console.error(err);
    const isDev = env_1.env.NODE_ENV === "development";
    const raw = err instanceof Error ? err.message : "";
    // A database that's unreachable is worth its own status and message -
    // it's not the caller's fault, and on Neon's free tier it's often just
    // the database waking up from auto-suspend, which a retry fixes.
    const isDbUnreachable = raw.includes("Can't reach database server");
    if (isDbUnreachable) {
        return res.status(503).json({
            ok: false,
            error: {
                code: "DB_UNAVAILABLE",
                message: isDev
                    ? raw
                    : "The service is temporarily unavailable. Please try again in a moment.",
            },
        });
    }
    res.status(500).json({
        ok: false,
        error: {
            code: "INTERNAL",
            message: isDev ? raw || "Something went wrong" : "Something went wrong",
        },
    });
}
//# sourceMappingURL=error.js.map