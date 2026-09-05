import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { notFound, errorHandler } from "./middleware/error";

export function createApp(): Express {
  const app = express();

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
  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  // Security headers + JSON body parsing.
  app.use(helmet());
  app.use(
    express.json({
      limit: "1mb",
      /**
       * Keeps a copy of the raw request bytes. Razorpay signs its
       * webhooks over exactly what it sent, so verifying against the
       * parsed-and-reserialised object would never match.
       */
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  // Request logging - "dev" format is short and colorized for local work.
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

  // Only let the web app call us.
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

    // A broad backstop. Individual routes add tighter limits of their own -
  // see middleware/rate-limits.ts.
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );

  app.use("/api", apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}