"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("./config/env");
const routes_1 = require("./routes");
const error_1 = require("./middleware/error");
function createApp() {
    const app = (0, express_1.default)();
    /**
   * Behind a load balancer (as on Elastic Beanstalk), req.ip is the
   * balancer's address unless Express is told to read X-Forwarded-For.
   * Without this every student looks like the same IP and shares one
   * rate-limit bucket.
   *
   * Set to 1 rather than `true`: trusting the header unconditionally
   * lets a caller forge their own IP and slip past IP-based limits
   * entirely. One hop matches a single load balancer - confirm the real
   * number when the AWS setup is finalised.
   */
    if (env_1.env.NODE_ENV === "production") {
        app.set("trust proxy", 1);
    }
    // Security headers + JSON body parsing.
    app.use((0, helmet_1.default)());
    app.use(express_1.default.json({
        limit: "1mb",
        /**
         * Keeps a copy of the raw request bytes. Razorpay signs its
         * webhooks over exactly what it sent, so verifying against the
         * parsed-and-reserialised object would never match.
         */
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        },
    }));
    // Request logging - "dev" format is short and colorized for local work.
    app.use((0, morgan_1.default)(env_1.env.NODE_ENV === "development" ? "dev" : "combined"));
    // Only let the web app call us.
    app.use((0, cors_1.default)({ origin: env_1.env.WEB_ORIGIN, credentials: true }));
    // A broad backstop. Individual routes add tighter limits of their own -
    // see middleware/rate-limits.ts.
    app.use((0, express_rate_limit_1.default)({
        windowMs: 60000,
        limit: 120,
        standardHeaders: "draft-7",
        legacyHeaders: false,
    }));
    app.use("/api", routes_1.apiRouter);
    app.use(error_1.notFound);
    app.use(error_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map