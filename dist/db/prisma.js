"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
/**
 * Prisma error codes that mean "the connection was dead", not "the query
 * was wrong". Only these are worth retrying - retrying a genuine query
 * error would just fail again more slowly.
 *
 *   P1001 - can't reach the database server
 *   P1017 - the server closed the connection
 */
const RETRYABLE_CODES = ["P1001", "P1017"];
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [500, 2000, 4000];
function isRetryable(err) {
    if (err instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        return RETRYABLE_CODES.includes(err.code);
    }
    // Thrown when the client can't establish a connection at all.
    return err instanceof client_1.Prisma.PrismaClientInitializationError;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function createClient() {
    const client = new client_1.PrismaClient();
    /**
     * Retries queries that failed because the database was asleep.
     *
     * Neon's free tier suspends after about five minutes idle. The first
     * request afterwards fails - but that same request is what wakes the
     * database, so a retry a moment later succeeds. Without this, the
     * first student every morning sees an error and has to try again,
     * every single day.
     *
     * Only connection errors are retried. A bad query is not retried; it
     * would fail identically and just take longer to do it.
     *
     * Note this retries the *query*, so a query inside a transaction that
     * fails this way will roll the whole transaction back rather than
     * retry mid-flight. That's the safe behaviour - a half-applied
     * transaction would be worse than an error.
     */
    return client.$extends({
        query: {
            async $allOperations({ args, query }) {
                let lastError;
                for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                    try {
                        return await query(args);
                    }
                    catch (err) {
                        lastError = err;
                        if (!isRetryable(err) || attempt === MAX_ATTEMPTS - 1)
                            throw err;
                        const wait = BACKOFF_MS[attempt] ?? 1200;
                        console.warn(`Database unreachable, retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
                        await sleep(wait);
                    }
                }
                throw lastError;
            },
        },
    });
}
/**
 * A single, shared Prisma Client for the whole app. Every other file
 * imports `prisma` from here - nobody should ever write
 * `new PrismaClient()` themselves.
 *
 * Without this pattern, every hot-reload in dev opens a fresh
 * connection pool and the old ones are never closed. At 10-15k
 * concurrent users that exhausts Neon's connection limit almost
 * immediately.
 */
exports.prisma = globalThis.prismaGlobal ?? createClient();
if (process.env.NODE_ENV !== "production") {
    globalThis.prismaGlobal = exports.prisma;
}
//# sourceMappingURL=prisma.js.map