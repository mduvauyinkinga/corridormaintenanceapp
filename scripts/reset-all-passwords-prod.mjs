/**
 * scripts/reset-all-passwords-prod.mjs
 * ------------------------------------------------------------------
 * Production-ready one-off tool: resets the login password of EVERY user
 * in the `users` table to a single value, connecting to a real PostgreSQL
 * database via the `pg` driver (DATABASE_URL).
 *
 * It reuses the same hashing parameters the app's register/login endpoints
 * use (bcrypt.hash(pass, 10) with bcryptjs), so the new password is
 * compatible with /api/auth/login immediately.
 *
 * Intended target: Render PostgreSQL (corridor-postgres) or any external
 * Postgres instance the app is configured to use.
 *
 * Prerequisites:
 *   - The `server` folder dependencies installed (npm ci / npm install).
 *   - DATABASE_URL set in your environment (Render provides it automatically
 *     when the web service is linked to the corridor-postgres database).
 *   - Network access to the production Postgres (from your machine or from
 *     a Render shell/console).
 *
 * Usage:
 *   # From the server folder, with DATABASE_URL in your shell:
 *   DATABASE_URL="postgres://..." node scripts/reset-all-passwords-prod.mjs
 *
 *   # Or load from a .env file first:
 *   #   node -r dotenv/config scripts/reset-all-passwords-prod.mjs
 *
 * Safety:
 *   - Runs outside the HTTP server; no active sessions are disturbed.
 *   - Logs each affected user (email + role) so you can verify afterwards.
 *   - Exits non-zero on any failure so CI/CD can catch it.
 */

import { Pool } from "pg";
import bcrypt from "bcryptjs";

const TARGET_PASSWORD = "LoveMyself#1"; // <-- the password all users will use
const SALT_ROUNDS = 10;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Export it (e.g. from Render dashboard) and re-run."
    );
  }
  if (TARGET_PASSWORD.length < 8) {
    throw new Error("Target password is shorter than the app minimum of 8 characters.");
  }

  console.log(`[reset-prod] Connecting to production PostgreSQL...`);
  const pool = new Pool({ connectionString: databaseUrl });
  pool.on("error", (err) => console.error("[reset-prod] unexpected pool error:", err.message));

  try {
    // Hash exactly like the app does (bcrypt.hash(pass, 10)).
    const passwordHash = await bcrypt.hash(TARGET_PASSWORD, SALT_ROUNDS);

    // List every current user so we can report what changed.
    const usersRes = await pool.query(
      "SELECT id, email, role FROM users ORDER BY email"
    );
    const users = usersRes.rows;

    if (!users.length) {
      console.log("[reset-prod] No users found in the users table. Nothing to change.");
      return;
    }

    console.log(
      `[reset-prod] Found ${users.length} user(s). Resetting all passwords to "${TARGET_PASSWORD}"...`
    );

    let updated = 0;
    for (const user of users) {
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        passwordHash,
        user.id,
      ]);
      updated++;
      console.log(`  ✓ ${user.email} (role: ${user.role}, id: ${user.id})`);
    }

    // Sanity check: verify bcrypt.compare works for the first user.
    const sample = users[0];
    const rowRes = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [sample.id]
    );
    const ok = await bcrypt.compare(TARGET_PASSWORD, rowRes.rows[0].password_hash);

    console.log(`\n[reset-prod] Done. ${updated}/${users.length} password(s) updated.`);
    console.log(
      `[reset-prod] Verification (sample: ${sample.email}): bcrypt.compare = ${ok}`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[reset-prod] FAILED:", err.message);
  process.exit(1);
});
