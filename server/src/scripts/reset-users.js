/**
 * scripts/reset-users.js
 * ------------------------------------------------------------------
 * One-time reset: erase every resident user (and all their data) while
 * keeping the single management (admin) account intact.
 *
 * What gets deleted:
 *   - All users with role != 'management'
 *   - Their complaints (ON DELETE CASCADE → notes, timeline, photos)
 * What gets reset:
 *   - All units: occupied = FALSE, resident_id = NULL (free every bed)
 *
 * What is preserved:
 *   - The management account (seeded from MANAGER_EMAIL env var)
 *   - Rooms and units (bed slots remain, just unoccupied)
 *   - unit_announcements (tied to rooms, not users)
 *
 * Usage (from server/):
 *   node src/scripts/reset-users.js
 */
import { query, queryRow } from "../db.js";

async function main() {
  // Count non-management users before deletion.
  const before = await queryRow(
    "SELECT COUNT(*)::int AS n FROM users WHERE role <> 'management'"
  );
  const beforeCount = before ? before.n : 0;

  if (beforeCount === 0) {
    console.log("[reset] No resident users to delete. Nothing to do.");
    return;
  }

  // Delete every non-management user. Complaints cascade-delete via FK,
  // and units have resident_id SET NULL (beds freed but occupied flag
  // may still be TRUE, so we reset that explicitly next).
  const deleted = await query(
    "DELETE FROM users WHERE role <> 'management'"
  );
  console.log(
    `[reset] Deleted ${deleted.rowCount} resident user(s) (was ${beforeCount}).`
  );

  // Free every bed: un-occupy all units and clear resident assignments.
  const freed = await query(
    `UPDATE units
      SET occupied = FALSE,
          resident_id = NULL
     WHERE occupied = TRUE OR resident_id IS NOT NULL`
  );
  console.log(
    `[reset] Freed ${freed.rowCount} unit(s) (occupied → FALSE, resident_id → NULL).`
  );

  // Verify the management account still exists.
  const manager = await queryRow(
    "SELECT id, email, role FROM users WHERE role = 'management' LIMIT 1"
  );
  if (manager) {
    console.log(
      `[reset] Management account preserved: ${manager.email} (${manager.role})`
    );
  } else {
    console.warn(
      "[reset] WARNING: no management account found! It will be re-seeded on next server boot."
    );
  }

  console.log("[reset] Done. Residents can now re-register.");
}

main().catch((err) => {
  console.error("[reset] FATAL ERROR:", err.message);
  process.exit(1);
});
