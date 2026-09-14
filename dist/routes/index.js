"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const express_1 = require("express");
const health_route_1 = require("./health.route");
const auth_route_1 = require("./auth.route");
const users_route_1 = require("./users.route");
const chats_route_1 = require("./chats.route");
const admin_route_1 = require("./admin.route");
const uploads_route_1 = require("./uploads.route");
const payments_route_1 = require("./payments.route");
exports.apiRouter = (0, express_1.Router)();
exports.apiRouter.use("/health", health_route_1.healthRouter);
exports.apiRouter.use("/auth", auth_route_1.authRouter);
exports.apiRouter.use("/users", users_route_1.usersRouter);
// Mounted before chatsRouter so /api/chats/:id/upload is matched by the
// uploads router rather than falling through.
exports.apiRouter.use("/chats", uploads_route_1.uploadsRouter);
exports.apiRouter.use("/chats", chats_route_1.chatsRouter);
exports.apiRouter.use("/admin", admin_route_1.adminRouter);
exports.apiRouter.use("/payments", payments_route_1.paymentsRouter);
//# sourceMappingURL=index.js.map