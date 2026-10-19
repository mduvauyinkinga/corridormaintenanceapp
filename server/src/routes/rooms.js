/**
 * routes/rooms.js
 * ------------------------------------------------------------------
 * Read-only room endpoints (mirror of js/choose-room.js loadRooms).
 *   GET /api/rooms?block=A  -> sorted rooms in a block
 *   GET /api/rooms/:id      -> single room
 *
 * Rooms are static (blocks A-F), so no writes are exposed.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { queryRows } from "../db.js";

const router = Router();

// Room listings are only for signed-in users (matches the old Firestore
// rules, where `rooms` reads required `signedIn()`).
router.use(requireAuth);

/** GET /api/rooms?block=A -> [{ id, block, roomNumber, floor }, ...] */
router.get("/", async (req, res, next) => {
  try {
    const block = req.query.block;
    let rows;
    if (block) {
      rows = await queryRows(
        "SELECT id, block, room_number AS \"roomNumber\", floor FROM rooms WHERE block = $1 ORDER BY room_number",
        [block]
      );
    } else {
      rows = await queryRows(
        "SELECT id, block, room_number AS \"roomNumber\", floor FROM rooms ORDER BY block, room_number"
      );
    }
    res.json({ rooms: rows });
  } catch (err) {
    next(err);
  }
});

/** GET /api/rooms/:id -> a single room document */
router.get("/:id", async (req, res, next) => {
  try {
    const row = await queryRows(
      "SELECT id, block, room_number AS \"roomNumber\", floor FROM rooms WHERE id = $1",
      [req.params.id]
    );
    if (row.length === 0) return res.status(404).json({ error: "Room not found." });
    res.json({ room: row[0] });
  } catch (err) {
    next(err);
  }
});

export default router;