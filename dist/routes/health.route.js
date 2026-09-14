"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../db/prisma");
exports.healthRouter = (0, express_1.Router)();
exports.healthRouter.get("/", async (_req, res) => {
    let dbStatus = "disconnected";
    try {
        // A trivial real query - if this succeeds, the database is genuinely
        // reachable, not just "the app started without crashing".
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        dbStatus = "connected";
    }
    catch {
        dbStatus = "disconnected";
    }
    res.json({
        ok: true,
        data: {
            status: "up",
            db: dbStatus,
            time: new Date().toISOString(),
        },
    });
});
//# sourceMappingURL=health.route.js.map