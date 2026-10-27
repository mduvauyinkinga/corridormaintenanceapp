/**
 * routes/admin.js
 * ------------------------------------------------------------------
 * Management-only admin operations.
 *   POST /api/admin/seed  -> idempotent rooms+units seed (233/1398)
 *
 * Uses the shared seedRoomsAndUnits() (same as the boot seed), so the
 * endpoint and server startup always generate identical data.
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { query, queryRow } from "../db.js";
import { seedRoomsAndUnits } from "../rooms-data.js";
import { runRetention, archiveAfterDays, deleteAfterDays } from "../services/retention.js";

const router = Router();
router.use(requireAuth, requireRole(["management"]));

/** POST /api/admin/seed — idempotent, never touches occupied beds. */
router.post("/seed", async (req, res, next) => {
  try {
    res.json(await seedRoomsAndUnits(query, queryRow));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/users — every user (management bulk read).
 * Returns the camelCase public shape (uid, name, studentNumber, ...).
 */
router.get("/users", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id AS uid, name, student_number AS "studentNumber", email, role,
              room_id AS "roomId", unit_id AS "unitId", room_letter AS "roomLetter",
              block, room_number AS "roomNumber", created_at AS "createdAt"
       FROM users ORDER BY created_at DESC`
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/overview — rooms + units + complaints in one round trip
 * (replaces management.js loadAllData's four parallel Firestore reads).
 */
router.get("/overview", async (req, res, next) => {
  try {
    // Archived complaints are hidden from the default management queue.
    // Pass ?includeArchived=true to also fetch them (Archived toggle).
    const includeArchived = String(req.query.includeArchived || "").toLowerCase() === "true";
    const [roomsRes, unitsRes, complaintsRes] = await Promise.all([
      query("SELECT id, block, room_number AS \"roomNumber\", floor FROM rooms ORDER BY block, room_number"),
      query(
        `SELECT id, room_id AS "roomId", room_letter AS "roomLetter", bed_number AS "bedNumber",
                occupied, resident_id AS "residentId", room_letter AS "unitName",
                block, room_number AS "roomNumber", floor
         FROM units ORDER BY room_id, room_letter, bed_number`
      ),
      query(
        `SELECT id, resident_id AS "residentId", room_id AS "roomId", unit_id AS "unitId",
                issues, category, priority, notes, status,
                reopen_requested AS "reopenRequested", reopen_status AS "reopenStatus",
                photo_urls AS "photoURLs",
                estimated_completion AS "estimatedCompletion",
                actual_completion AS "actualCompletion",
                COALESCE(archived, FALSE) AS "archived",
                archived_at AS "archivedAt",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM complaints
         WHERE ($1::boolean IS TRUE OR COALESCE(archived, FALSE) = FALSE)
         ORDER BY created_at DESC`,
        [includeArchived === "true"]
      ),
    ]);
    res.json({
      rooms: roomsRes.rows,
      units: unitsRes.rows,
      complaints: complaintsRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/retention — current retention policy + queue counts.
 */
router.get("/retention", async (req, res, next) => {
  try {
    const counts = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = ANY($1::text[]) AND COALESCE(archived, FALSE) = FALSE
           AND (reopen_requested IS NOT TRUE)
           AND updated_at < NOW() - ($2 || ' days')::INTERVAL) AS "archiveDue",
         COUNT(*) FILTER (WHERE status = ANY($1::text[]) AND (reopen_requested IS NOT TRUE)
           AND updated_at < NOW() - ($3 || ' days')::INTERVAL) AS "deleteDue",
         COUNT(*) FILTER (WHERE COALESCE(archived, FALSE) = TRUE) AS "archived"
       FROM complaints`,
      [["Completed", "Cancelled"], String(archiveAfterDays()), String(deleteAfterDays())]
    );
    res.json({
      archiveAfterDays: archiveAfterDays(),
      deleteAfterDays: deleteAfterDays(),
      ...(counts.rows[0] || { archiveDue: 0, deleteDue: 0, archived: 0 }),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/retention/run — trigger archive + delete now.
 * Query ?dryRun=true to preview without changing anything.
 */
router.post("/retention/run", async (req, res, next) => {
  try {
    const dryRun = String(req.query.dryRun || "").toLowerCase() === "true";
    res.json(await runRetention({ dryRun }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/release-orphans — free beds whose resident no longer
 * exists (replaces the Cloud Function + client-side batch repair).
 * Returns { released: <count> }.
 */
router.post("/release-orphans", async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE units SET occupied = FALSE, resident_id = NULL
       WHERE occupied = TRUE AND resident_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM users WHERE users.id = units.resident_id)`
    );
    res.json({ released: result.rowCount || 0 });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/reset-users — erase every resident user and all their
 * data (complaints cascade-delete), then free every bed. The management
 * account is preserved. Intended for a fresh start so residents must
 * re-register.
 * Returns { deletedUsers: <n>, freedUnits: <n> }.
 */
router.post("/reset-users", async (req, res, next) => {
  try {
    const before = await queryRow(
      "SELECT COUNT(*)::int AS n FROM users WHERE role <> 'management'"
    );
    const beforeCount = before ? before.n : 0;

    if (beforeCount === 0) {
      return res.json({
        deletedUsers: 0,
        freedUnits: 0,
        message: "No resident users to delete.",
      });
    }

    const deleted = await query(
      "DELETE FROM users WHERE role <> 'management'"
    );

    const freed = await query(
      `UPDATE units
        SET occupied = FALSE,
            resident_id = NULL
       WHERE occupied = TRUE OR resident_id IS NOT NULL`
    );

    res.json({
      deletedUsers: deleted.rowCount || 0,
      freedUnits: freed.rowCount || 0,
      message: `Reset complete: ${deleted.rowCount} resident user(s) removed, ${freed.rowCount} bed(s) freed.`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

