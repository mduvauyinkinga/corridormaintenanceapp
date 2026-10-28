/**
 * controllers/unitsController.js
 * ------------------------------------------------------------------
 * Reusable query + claim helpers for the unit endpoints.
 */

import { queryRows, getClient } from "../db.js";

/**
 * Return all bed slots for a room.
 * Rows: { id, room_letter, bed_number, occupied, resident_id, unit_name, block, room_number, floor }
 * (unit_name is aliased from room_letter — the SQL schema has no unit_name
 * column; clients use roomLetter || unitName so both work.)
 */
export async function getUnitsByRoom(roomId) {
  return queryRows(
    `SELECT id, room_letter AS roomLetter, bed_number AS bedNumber, occupied, resident_id AS residentId,
            room_id AS roomId, room_letter AS unitName, block, room_number AS roomNumber, floor
     FROM units WHERE room_id = $1 ORDER BY bed_number`,
    [roomId]
  );
}

/**
 * Return a single bed slot by id.
 * 
 * Row: { id, room_letter, bed_number, occupied, resident_id, unit_name, block, room_number, floor } | null
 */
export async function getUnitById(id) {
  const rows = await queryRows(
    `SELECT id, room_id AS roomId, room_letter AS roomLetter, bed_number AS bedNumber,
            occupied, resident_id AS residentId, room_letter AS unitName, block, room_number AS roomNumber, floor
     FROM units WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Atomic claimUnit transaction. Mirrors js/choose-room.js.
 * Throws on conflict; otherwise commits and returns { ok: true }.
 */
export async function claimUnit({ uid, unitId, roomId, block, roomNumber }) {
  if (!uid || !unitId || !roomId) {
    const err = new Error("Missing required fields: uid, unitId, roomId.");
    err.status = 400;
    throw err;
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");

    // 1. Re-read the selected unit inside the transaction.
    const unitRows = await client.query(
      `SELECT id, room_id AS roomId, room_letter AS roomLetter, bed_number AS bedNumber,
              occupied, resident_id AS residentId, room_letter AS unitName,
              block, room_number AS roomNumber, floor
       FROM units WHERE id = $1`,
      [unitId]
    );
    if (unitRows.rows.length === 0) {
      await client.query("ROLLBACK");
      const err = new Error("This unit no longer exists.");
      err.status = 409;
      throw err;
    }
    const unit = unitRows.rows[0];

    // 2. Verify it is still available.
    if (unit.occupied !== false) {
      await client.query("ROLLBACK");
      const err = new Error("Sorry, this room was just taken. Please choose another.");
      err.status = 409;
      throw err;
    }

    // 3. Verify the resident does not already have a room assigned.
    const userRows = await client.query(
      "SELECT room_id AS roomId FROM users WHERE id = $1",
      [uid]
    );
    const userData = userRows.rows[0];
    if (userData?.roomId) {
      await client.query("ROLLBACK");
      const err = new Error("You already have a room assigned.");
      err.status = 400;
      throw err;
    }

    // 4. Update the unit as occupied.
    await client.query(
      "UPDATE units SET occupied = true, resident_id = $1 WHERE id = $2",
      [uid, unitId]
    );

    // 5. Update the resident profile so the dashboard needs no extra reads.
    const roomLetter = unit.roomLetter || unit.unitName || null;
    const roomNum = Number(roomNumber ?? unit.roomNumber);
    await client.query(
      `UPDATE users SET room_id = $1, unit_id = $2, room_letter = $3,
                          block = $4, room_number = $5 WHERE id = $6`,
      [roomId, unitId, roomLetter, block ?? unit.block ?? null, roomNum, uid]
    );

    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}