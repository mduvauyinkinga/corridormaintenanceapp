/**
 * routes/units.js
 * ------------------------------------------------------------------
 * Bed-slot read + atomic claim endpoints (mirror of js/choose-room.js).
 *   GET /api/units?roomId=:id  -> bed slots in a room
 *   GET /api/units/:id         -> single bed slot
 *   POST /api/units/claim      -> atomic claimUnit transaction
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { queryRows } from "../db.js";
import { claimUnit } from "../controllers/unitsController.js";

const router = Router();

// Bed occupancy data is only for signed-in users (matches the old
// Firestore rules, where `units` reads required `signedIn()`).
router.use(requireAuth);

/** GET /api/units?roomId=:id -> [{ id, roomLetter, bedNumber, occupied, residentId, ... }] */
router.get("/", async (req, res, next) => {
  try {
    const roomId = req.query.roomId;
    if (!roomId) return res.status(400).json({ error: "Missing query param: roomId." });
    const rows = await queryRows(
      `SELECT id, room_letter AS "roomLetter", bed_number AS "bedNumber", occupied, resident_id AS "residentId",
              room_id AS "roomId", room_letter AS "unitName", block, room_number AS "roomNumber", floor
       FROM units WHERE room_id = $1 ORDER BY bed_number`,
      [roomId]
    );
    res.json({ units: rows });
  } catch (err) {
    next(err);
  }
});

/** GET /api/units/:id -> a single unit document */
router.get("/:id", async (req, res, next) => {
  try {
    const row = await queryRows(
      `SELECT id, room_id AS "roomId", room_letter AS "roomLetter", bed_number AS "bedNumber",
              occupied, resident_id AS "residentId", room_letter AS "unitName", block, room_number AS "roomNumber", floor
       FROM units WHERE id = $1`,
      [req.params.id]
    );
    if (row.length === 0) return res.status(404).json({ error: "Unit not found." });
    res.json({ unit: row[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/units/claim
 * ------------------------------------------------------------------
 * Atomic equivalent of the Firestore transaction in js/choose-room.js:
 *   1. Re-read the selected unit inside the transaction.
 *   2. Refuse when it is no longer available (occupied !== false).
 *   3. Refuse when the resident already has a room assigned.
 *   4. Mark the unit occupied and assign residentId.
 *   5. Write roomId/unitId/roomLetter/block/roomNumber onto the profile.
 *   6. Commit.
 *
 * Request body: { unitId, roomId, block, roomNumber }
 * The claiming uid comes from the VERIFIED JWT (req.user.id) — never
 * from the request body, so no client can claim a bed for someone else.
 * Response: { ok: true } | 409 (stale selection) | 400 (already assigned)
 */
router.post("/claim", async (req, res, next) => {
  const { unitId, roomId, block, roomNumber } = req.body || {};
  if (!unitId || !roomId) {
    return res.status(400).json({ error: "Missing required fields: unitId, roomId." });
  }

  try {
    await claimUnit({ uid: req.user.id, unitId, roomId, block, roomNumber });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;