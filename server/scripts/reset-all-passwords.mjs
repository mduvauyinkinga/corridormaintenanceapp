/**
 * scripts/reset-all-passwords.mjs
 * ------------------------------------------------------------------
 * One-off admin tool: resets the login password of EVERY user in the
 * `users` table to a single value.
 *
 * It reuses the app's own database layer (server/src/db.js) and bcryptjs,
 * so the new password is hashed with the exact same parameters the
 * register/login endpoints use (bcrypt.hash(pass, 10)).
 *
 * The management account (manager@gmail.com) is refreshed too — it already
 * uses LoveMyself#1 via MANAGER_PASSWORD in server/.env, and this script
 * makes every resident match it.
 *
 * Usage (from the server folder):
 *   node scripts/reset-all-passwords.mjs
 *
 * Safety notes:
 *   - Runs outside the HTTP server, so no active sessions are disturbed.
 *   - Logs each affected user (email + role) so you can verify afterwards.
 *   - Password is 15 chars, satisfying the app's min-8 rule.
 */

import bcrypt from "bcryptjs";
import { queryRows, queryRow } from "../src/db.js";

const TARGET_PASSWORD = "LoveMyself#1"; // <-- the password all users will use
const SALT_ROUNDS = 10;

async function main() {
  if (TARGET_PASSWORD.length < 8) {
    throw new Error("Target password is shorter than the app minimum of 8 characters.");
  }

  const passwordHash = await bcrypt.hash(TARGET_PASSWORD, SALT_ROUNDS);

  // List every current user so we can report what changed.
  const users = await queryRows("SELECT id, email, role FROM users ORDER BY email");
  if (!users.length) {
    console.log("[reset] No users found in the users table. Nothing to change.");
    return;
  }

  console.log(`[reset] Found ${users.length} user(s). Resetting all passwords to "${TARGET_PASSWORD}"...`);

  let updated = 0;
  for (const user of users) {
    await queryRow(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [passwordHash, user.id]
    );
    updated++;
    console.log(`  ✓ ${user.email} (role: ${user.role}, id: ${user.id})`);
  }

  // Sanity check: verify bcrypt.compare works for a sample user.
  const sample = users[0];
  const row = await queryRow("SELECT password_hash FROM users WHERE id = $1", [sample.id]);
  const ok = await bcrypt.compare(TARGET_PASSWORD, row.password_hash);

  console.log(`\n[reset] Done. ${updated}/${users.length} password(s) updated.`);
  console.log(`[reset] Verification (sample: ${sample.email}): bcrypt.compare = ${ok}`);
}

main().catch((err) => {
  console.error("[reset] FAILED:", err.message);
  process.exit(1);
});
