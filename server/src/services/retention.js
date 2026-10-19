/**
 * services/retention.js
 * ------------------------------------------------------------------
 * Complaint retention job:
 *   - Archive: Completed/Cancelled complaints whose `updated_at` is older
 *     than ARCHIVE_AFTER_DAYS (default 14) get archived=TRUE (hidden from
 *     the default management queue, still in the database).
 *   - Delete: Completed/Cancelled rows whose `updated_at` is older than
 *     DELETE_AFTER_DAYS (default 180) are hard-deleted. Notes, timeline
 *     events and photo bytes go with them via ON DELETE CASCADE.
 *   - Pending reopen requests (reopen_requested=TRUE) are never touched.
 *
 * Runs on server boot + every 24h. Management can also trigger it via
 * POST /api/admin/retention/run (?dryRun=true to preview).
 */
import { query, queryRows } from "../db.js";
import config from "../config.js";

export const ARCHIVE_STATUSES = ["Completed", "Cancelled"];

/** Days after resolution before a complaint leaves the active queue. */
export function archiveAfterDays() {
  const n = parseInt(process.env.ARCHIVE_AFTER_DAYS || "14", 10);
  return Number.isFinite(n) && n >= 0 ? n : 14;
}

/** Days after resolution before a complaint is hard-deleted. */
export function deleteAfterDays() {
  const n = parseInt(process.env.DELETE_AFTER_DAYS || "180", 10);
  return Number.isFinite(n) && n >= 0 ? n : 180;
}

function intervalDays(n) {
  return `${n} days`;
}

/**
 * Flag old Completed/Cancelled rows as archived.
 * @returns {Promise<{archived:number, ids:string[]}>}
 */
export async function archiveOldComplaints({ dryRun = false } = {}) {
  const days = archiveAfterDays();
  const rows = await queryRows(
    `SELECT id FROM complaints
      WHERE archived = FALSE
        AND status = ANY($1)
        AND (reopen_requested IS NOT TRUE)
        AND updated_at < NOW() - $2::INTERVAL
      ORDER BY updated_at ASC
      LIMIT 5000`,
    [ARCHIVE_STATUSES, intervalDays(days)]
  );
  const ids = rows.map((r) => r.id);
  if (!dryRun && ids.length) {
    await query(
      `UPDATE complaints SET archived = TRUE, archived_at = NOW()
        WHERE id = ANY($1)`,
      [ids]
    );
  }
  return { archived: ids.length, ids };
}

/**
 * Hard-delete old Completed/Cancelled rows.
 *
 * Age is measured purely from `updated_at` (the resolution moment).
 * Deliberately NOT archived_at: the archive step runs first and stamps
 * archived_at = NOW(), which would reset the delete clock by 180 days.
 * @returns {Promise<{deleted:number, ids:string[]}>}
 */
export async function deleteOldComplaints({ dryRun = false } = {}) {
  const days = deleteAfterDays();
  const rows = await queryRows(
    `SELECT id FROM complaints
      WHERE status = ANY($1)
        AND (reopen_requested IS NOT TRUE)
        AND updated_at < NOW() - $2::INTERVAL
      ORDER BY updated_at ASC
      LIMIT 5000`,
    [ARCHIVE_STATUSES, intervalDays(days)]
  );
  const ids = rows.map((r) => r.id);
  if (!dryRun && ids.length) {
    await query(`DELETE FROM complaints WHERE id = ANY($1)`, [ids]);
  }
  return { deleted: ids.length, ids };
}

/** Run archive + delete in sequence. Used by boot scheduler + admin route. */
export async function runRetention({ dryRun = false } = {}) {
  const archived = await archiveOldComplaints({ dryRun });
  const deleted = await deleteOldComplaints({ dryRun });
  return {
    dryRun,
    archiveAfterDays: archiveAfterDays(),
    deleteAfterDays: deleteAfterDays(),
    archived: archived.archived,
    deleted: deleted.deleted,
    // Separate id lists — a shared `ids` key would let the delete step
    // overwrite the archive step's ids.
    archivedIds: archived.ids,
    deletedIds: deleted.ids,
  };
}

let timer = null;

/** Start the boot + daily retention scheduler (idempotent). */
export function startRetentionScheduler() {
  if (timer || config.nodeEnv === "test") return timer;
  const runSoon = async () => {
    try {
      const result = await runRetention();
      if (result.archived || result.deleted) {
        console.log(`[retention] archived=${result.archived} deleted=${result.deleted}`);
      }
    } catch (err) {
      console.error("[retention] scheduled run failed:", err.message);
    }
  };
  // First pass shortly after boot (migrations/seeds already done), then daily.
  setTimeout(runSoon, 60 * 1000);
  timer = setInterval(runSoon, 24 * 60 * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
