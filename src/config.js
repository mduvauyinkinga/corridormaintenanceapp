// config.js - loads and validates environment variables.
// This is the ONLY place process.env is read.
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load server/.env relative to this file, so the server starts correctly
// no matter which working directory node is launched from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  databaseUrl: process.env.DATABASE_URL || "",
  // "pg" (real PostgreSQL, default) or "pglite" (zero-install in-memory
  // Postgres for local dev/testing - no external database needed).
  databaseDriver: process.env.DATABASE_DRIVER || "pg",
  // "pg" (real PostgreSQL, required for mobile app auth) or undefined for Firebase-only mode
  // Frontend now uses Firebase Auth + Firestore - no database driver needed for frontend
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  allowedDomain: process.env.ALLOWED_DOMAIN || "@tut4life.ac.za",
  nodeEnv: process.env.NODE_ENV || "development",
  // Retention: days after resolution before Completed/Cancelled leaves the
  // active queue (archived=TRUE) and before it is hard-deleted.
  archiveAfterDays: parseInt(process.env.ARCHIVE_AFTER_DAYS || "14", 10),
  deleteAfterDays: parseInt(process.env.DELETE_AFTER_DAYS || "180", 10),

  // SMTP for password-reset emails. Leave SMTP_HOST empty in dev to log
  // reset links to the console instead of sending real email.
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: parseInt(process.env.SMTP_PORT || "587", 10),
  smtpSecure: process.env.SMTP_SECURE || "false",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "",

  // Base URL of the website (where reset-password.html lives). Used to build
  // the reset link emailed to residents. Override for production.
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:4000",
  // NOTE: Frontend Firebase settings are in ../js/config.js
  // This server no longer needs PostgreSQL connection strings for frontend operations
};

// Throw a clear error when a required variable is missing.
export function validateConfig() {
  const missing = [];
  // Only validate DATABASE_URL if using pg driver (for mobile app auth)
  // Frontend uses Firebase, so DATABASE_URL is optional for Firebase-only mode
  if (config.databaseDriver === "pg" && !config.databaseUrl) missing.push("DATABASE_URL");
  if (config.databaseDriver === "pglite" && !config.jwtSecret) missing.push("JWT_SECRET");
  if (config.databaseDriver === "pg" && !config.jwtSecret) missing.push("JWT_SECRET");
  if (missing.length) {
    throw new Error("Missing required environment variables: " + missing.join(", ") + ". Copy .env.example to .env and fill in the values.");
  }

  if (config.nodeEnv === "production") {
    const insecure = [];
    // A wildcard CORS origin lets ANY website call the API with a stolen
    // or leaked token — production must pin the exact site origin(s).
    if (config.corsOrigin === "*") insecure.push("CORS_ORIGIN must list the exact site origin(s), not *");
    // Short secrets can be brute-forced offline if a token ever leaks.
    if (config.jwtSecret.length < 32) insecure.push("JWT_SECRET must be at least 32 characters");
    if (insecure.length) {
      throw new Error("Insecure production configuration: " + insecure.join("; ") + ".");
    }
  }
  return config;
}

export default config;