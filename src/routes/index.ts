import { Router } from "express";
import { healthRouter } from "./health.route";
import { authRouter } from "./auth.route";
import { usersRouter } from "./users.route";
import { chatsRouter } from "./chats.route";
import { adminRouter } from "./admin.route";
import { uploadsRouter } from "./uploads.route";
import { paymentsRouter } from "./payments.route";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
// Mounted before chatsRouter so /api/chats/:id/upload is matched by the
// uploads router rather than falling through.
apiRouter.use("/chats", uploadsRouter);
apiRouter.use("/chats", chatsRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/payments", paymentsRouter);