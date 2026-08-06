import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Security Headers Middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : undefined;

app.use(
  cors({
    credentials: true,
    origin: allowedOrigins || true,
  }),
);

app.use(
  clerkMiddleware((_req) => ({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  })),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

import mongoose from "mongoose";
import { connectDB } from "@workspace/db";

// ─── Connect to MongoDB on startup ──────────────────────────────────────
connectDB().then(() => logger.info("MongoDB connected")).catch((err) => logger.error({ err }, "MongoDB connection failed"));

// Readiness and health check
app.get(["/healthz", "/api/healthz"], async (_req: Request, res: Response) => {
  const state = mongoose.connection.readyState; // 1 = connected
  if (state === 1) {
    res.json({ status: "ok", timestamp: new Date().toISOString(), db: "connected" });
  } else {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

import path from "path";

const publicPath = path.resolve(import.meta.dirname, "../../omnicx-ai/dist");
app.use(express.static(publicPath));

app.use("/api", router);

// Serve SPA routes for Vite React App
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.resolve(publicPath, "index.html"), (err) => {
    if (err) {
      next();
    }
  });
});

// Global Error Handling Middleware
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal Server Error";
  logger.error({ err }, "Unhandled application error");
  res.status(500).json({ error: "An unexpected error occurred", details: process.env.NODE_ENV === "development" ? message : undefined });
});

export default app;
