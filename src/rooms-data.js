/**
 * rooms-data.js
 * ------------------------------------------------------------------
 * Single source of truth for the residence layout (blocks A-F).
 * Used by the boot seed (seedController) and POST /api/admin/seed so
 * both always generate identical rooms + bed slots.
 */

export const BLOCK_LAYOUT = {
  A: [
    { floor: 1, start: 101, end: 109 },
    { floor: 2, start: 201, end: 209 },
    { floor: 3, start: 301, end: 309 },
    { floor: 4, start: 401, end: 409 },
  ],
  B: [
    { floor: 1, start: 101, end: 109 },
    { floor: 2, start: 201, end: 209 },
    { floor: 3, start: 301, end: 309 },
    { floor: 4, start: 401, end: 409 },
  ],
  C: [
    { floor: 1, start: 101, end: 109 },
    { floor: 2, start: 201, end: 209 },
    { floor: 3, start: 301, end: 309 },
    { floor: 4, start: 401, end: 409 },
  ],
  D: [
    { floor: 1, start: 101, end: 108 },
    { floor: 2, start: 201, end: 208 },
    { floor: 3, start: 301, end: 308 },
    { floor: 4, start: 401, end: 408 },
  ],
  E: [
    { floor: 1, start: 101, end: 105 },
    { floor: 2, start: 201, end: 210 },
    { floor: 3, start: 301, end: 310 },
    { floor: 4, start: 401, end: 410 },
    { floor: 5, start: 501, end: 510 },
  ],
  F: [
    { floor: 1, start: 101, end: 105 },
    { floor: 2, start: 201, end: 210 },
    { floor: 3, start: 301, end: 310 },
    { floor: 4, start: 401, end: 410 },
    { floor: 5, start: 501, end: 513 },
  ],
};

export const ROOM_LETTERS = ["A", "B", "C"];
export const BED_NUMBERS = [1, 2];

/**
 * Insert all rooms + bed slots (idempotent, never touches occupied beds).
 * Returns { rooms, units, free } counts.
 */
export async function seedRoomsAndUnits(query, queryRow) {
  for (const [block, ranges] of Object.entries(BLOCK_LAYOUT)) {
    for (const { floor, start, end } of ranges) {
      for (let roomNumber = start; roomNumber <= end; roomNumber += 1) {
        const roomId = `${block}${roomNumber}`;
        await query(
          `INSERT INTO rooms (id, block, room_number, floor)
           VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [roomId, block, String(roomNumber), String(floor)]
        );
        for (const letter of ROOM_LETTERS) {
          for (const bed of BED_NUMBERS) {
            await query(
              `INSERT INTO units
                 (id, room_id, room_letter, bed_number, occupied, resident_id,
                  block, room_number, floor)
               VALUES ($1, $2, $3, $4, FALSE, NULL, $5, $6, $7)
               ON CONFLICT (id) DO NOTHING`,
              [`${roomId}-${letter}-${bed}`, roomId, letter, bed, block, String(roomNumber), String(floor)]
            );
          }
        }
      }
    }
  }
  const rooms = await queryRow("SELECT COUNT(*)::int AS n FROM rooms");
  const units = await queryRow("SELECT COUNT(*)::int AS n FROM units");
  const free = await queryRow("SELECT COUNT(*)::int AS n FROM units WHERE occupied = FALSE");
  return { rooms: rooms.n, units: units.n, free: free.n };
}
