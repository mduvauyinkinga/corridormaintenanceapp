/**
 * routes/announcements.js
 * ------------------------------------------------------------------
 * Room announcements (mirror of dashboard.js loadLatestUnitAnnouncement).
 *   GET /api/announcements?roomId=:id      -> newest first
 *   GET /api/announcements/latest?roomId=  -> single newest or null
 *   POST /api/announcements                -> management only
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { queryRows, queryRow } from "../db.js";
import { generateId } from "../uid.js";

const router = Router();
router.use(requireAuth);

function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.room_id,
    message: row.message,
    authorName: row.author_name,
    createdAt: row.created_at,
  };
}

/** GET /api/announcements?roomId=:id — newest first. */
router.get("/", async (req, res, next) => {
  try {
    const { roomId } = req.query;
    if (!roomId) return res.status(400).json({ error: "Missing query param: roomId." });
    const rows = await queryRows(
      "SELECT * FROM unit_announcements WHERE room_id = $1 ORDER BY created_at DESC",
      [roomId]
    );
    res.json({ announcements: rows.map(toPublic) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/announcements/latest?roomId=:id — newest one or null. */
router.get("/latest", async (req, res, next) => {
  try {
    const { roomId } = req.query;
    if (!roomId) return res.status(400).json({ error: "Missing query param: roomId." });
    const row = await queryRow(
      "SELECT * FROM unit_announcements WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1",
      [roomId]
    );
    res.json({ announcement: toPublic(row) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/announcements — management only. Body: { roomId, message }. */
router.post("/", requireRole(["management"]), async (req, res, next) => {
  try {
    const { roomId, message } = req.body || {};
    if (!roomId) return res.status(400).json({ error: "roomId is required." });
    if (!message || String(message).trim() === "") {
      return res.status(400).json({ error: "Message is required." });
    }
    if (String(message).length > 500) {
      return res.status(400).json({ error: "Message must be 500 characters or fewer." });
    }
    const author = await queryRow("SELECT name FROM users WHERE id = $1", [req.user.id]);
    const row = await queryRow(
      `INSERT INTO unit_announcements (id, room_id, message, author_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [generateId(), String(roomId), String(message).trim(), author?.name || "Management"]
    );
    res.status(201).json({ announcement: toPublic(row) });
  } catch (err) {
    next(err);
  }
});

export default router;
