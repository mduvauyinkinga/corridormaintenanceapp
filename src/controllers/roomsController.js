/**
 * controllers/roomsController.js
 * ------------------------------------------------------------------
 * Reusable query helpers for the room endpoints.
 */

import { queryRows } from "../db.js";

/**
 * Return all rooms, optionally filtered by block.
 * Rows: { id, block, room_number, floor }
 */
export async function getRoomsByBlock(block) {
  if (block) {
    return queryRows(
      "SELECT id, block, room_number, floor FROM rooms WHERE block = $1 ORDER BY room_number",
      [block]
    );
  }
  return queryRows(
    "SELECT id, block, room_number, floor FROM rooms ORDER BY block, room_number"
  );
}

/**
 * Return a single room by id.
 * Row: { id, block, room_number, floor } | null
 */
export async function getRoomById(id) {
  const rows = await queryRows(
    "SELECT id, block, room_number, floor FROM rooms WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}