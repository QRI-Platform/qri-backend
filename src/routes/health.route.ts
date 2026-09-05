import { Router } from "express";
import { prisma } from "../db/prisma";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  let dbStatus: "connected" | "disconnected" = "disconnected";

  try {
    // A trivial real query - if this succeeds, the database is genuinely
    // reachable, not just "the app started without crashing".
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch {
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