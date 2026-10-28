/**
 * controllers/seedController.js
 * ------------------------------------------------------------------
 * Boot-time seed for the private management account.
 *
 * The manager email/password live ONLY in server environment variables
 * (never in client code or git). On every boot the seed ensures exactly
 * one `management`-role user exists for that email:
 *   - missing            -> created with the env password
 *   - exists + resident  -> promoted to management + password reset
 *   - exists + management-> password refreshed when it differs
 *
 * No other email can ever become management through this path, and the
 * resident register endpoint rejects the manager email outright.
 */
import bcrypt from "bcryptjs";
import config from "../config.js";
import { query, queryRow } from "../db.js";
import { generateUid } from "../uid.js";
import { seedRoomsAndUnits } from "../rooms-data.js";

/** Seed (or repair) the management account. Returns true when configured. */
export async function seedManagementAccount() {
  const email = (process.env.MANAGER_EMAIL || "").trim().toLowerCase();
  const password = process.env.MANAGER_PASSWORD || "";

  if (!email || !password) {
    console.log("[seed] MANAGER_EMAIL/MANAGER_PASSWORD not set — skipping manager seed.");
    return false;
  }
  if (password.length < 8) {
    console.warn("[seed] MANAGER_PASSWORD is too short (min 8) — skipping manager seed.");
    return false;
  }

  const existing = await queryRow("SELECT * FROM users WHERE email = $1", [email]);

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await queryRow(
      `INSERT INTO users (id, name, student_number, email, password_hash, role, room_id, unit_id)
       VALUES ($1, $2, NULL, $3, $4, 'management', NULL, NULL)`,
      [generateUid(), process.env.MANAGER_NAME || "Residence Manager", email, passwordHash]
    );
    console.log(`[seed] management account created: ${email}`);
    return true;
  }

  // Repair path: promote to management and ensure the password matches env.
  const passwordOk = await bcrypt.compare(password, existing.password_hash);
  const needsRole = existing.role !== "management";
  if (!needsRole && passwordOk) return true;

  const passwordHash = passwordOk ? existing.password_hash : await bcrypt.hash(password, 10);
  await queryRow(
    "UPDATE users SET role = 'management', password_hash = $1 WHERE id = $2",
    [passwordHash, existing.id]
  );
  console.log(`[seed] management account ensured: ${email}${needsRole ? " (promoted)" : " (password refreshed)"}`);
  return true;
}

/**
 * Seed rooms + bed slots at boot when the tables are empty.
 * Idempotent (ON CONFLICT DO NOTHING) — safe on every restart, and never
 * touches occupied beds, so resident claims always survive.
 */
export async function seedRoomsIfEmpty() {
  const existing = await queryRow("SELECT COUNT(*)::int AS n FROM rooms");
  if (existing && existing.n > 0) return { skipped: true, rooms: existing.n };
  const counts = await seedRoomsAndUnits(query, queryRow);
  console.log(`[seed] rooms seeded at boot: ${counts.rooms} rooms, ${counts.units} beds.`);
  return counts;
}

