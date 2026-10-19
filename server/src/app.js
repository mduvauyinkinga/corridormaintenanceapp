/**
 * app.js
 * ------------------------------------------------------------------
 * Builds and configures the Express application. Kept separate from
 * index.js so tests can import the app without binding a port.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import config from "./config.js";
import authRoutes from "./routes/auth.js";
import roomsRoutes from "./routes/rooms.js";
import unitsRoutes from "./routes/units.js";
import complaintsRoutes from "./routes/complaints.js";
import announcementsRoutes from "./routes/announcements.js";
import adminRoutes from "./routes/admin.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  // Behind a proxy in production (Render/Railway/etc.) so req.ip is right.
  app.set("trust proxy", 1);

  // Security headers (HSTS, X-Content-Type-Options, frameguard, CSP for
  // JSON APIs, etc.). Safe for a JSON API served cross-origin to Pages.
  app.use(helmet());

  // CORS: allow the configured origins. Bearer tokens are used (not
  // cookies), so a wildcard is safe during development — but production
  // refuses to boot with "*" (see config.validateConfig).
  const origins =
    config.corsOrigin === "*"
      ? "*"
      : config.corsOrigin.split(",").map((o) => o.trim());
  app.use(cors({ origin: origins }));

  // Parse JSON request bodies.
  app.use(express.json({ limit: "2mb" }));

  // Health check (used by uptime monitors and the smoke test).
  // Registered BEFORE the rate limiters so monitors never consume budget.
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Global rate limit: generous ceiling so normal browsing never hits it,
  // but scripted floods (scrapers, credential stuffing across endpoints)
  // are cut off. Skip enforcement in tests so the smoke test is not
  // throttled by its own request volume.
  const enableRateLimits = config.nodeEnv !== "test";
  if (enableRateLimits) {
    app.use(
      "/api",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 600,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: { error: "Too many requests. Please try again later." },
      })
    );
  }

  // Feature routes — auth gets its own stricter limiter mounted BEFORE
  // the feature routers so login/register brute force is throttled per IP.
  if (enableRateLimits) {
    app.use(
      "/api/auth",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 30,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: { error: "Too many attempts. Please try again later." },
      })
    );
  }
  app.use("/api/auth", authRoutes);
  app.use("/api/rooms", roomsRoutes);
  app.use("/api/units", unitsRoutes);
  app.use("/api/complaints", complaintsRoutes);
  app.use("/api/announcements", announcementsRoutes);
  app.use("/api/admin", adminRoutes);

  // Unknown API route -> 404 JSON; then the central error handler.
  app.use("/api", notFound);
  app.use(errorHandler);

  return app;
}