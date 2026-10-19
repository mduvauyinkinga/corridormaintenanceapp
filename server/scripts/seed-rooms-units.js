/**
 * scripts/seed-rooms-units.js
 * ------------------------------------------------------------------
 * SQL seed for rooms + units (replaces seed-rooms.js + seed-units.js,
 * which targeted Firestore).
 *
 * Same layout, same deterministic IDs:
 *   233 parent rooms  (blocks A-F, e.g. "A101")
 *   1,398 bed slots   (3 letters x 2 beds, e.g. "A101-A-1")
 *
 * Idempotent: INSERT ... ON CONFLICT DO NOTHING, safe to re-run.
 * Respects occupied beds (never overwrites an assigned resident).
 *
 * Usage:  npm run seed   (from server/)
 */
import { query, queryRow } from "../src/db.js";
import { runMigrations } from "../src/migrate.js";

const BLOCK_LAYOUT = {
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

const ROOM_LETTERS = ["A", "B", "C"];
const BED_NUMBERS = [1, 2];

async function main() {
  await runMigrations();

  let roomCount = 0;
  let unitCount = 0;

  for (const [block, ranges] of Object.entries(BLOCK_LAYOUT)) {
    for (const { floor, start, end } of ranges) {
      for (let roomNumber = start; roomNumber <= end; roomNumber += 1) {
        const roomId = `${block}${roomNumber}`;
        await query(
          `INSERT INTO rooms (id, block, room_number, floor)
           VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [roomId, block, String(roomNumber), String(floor)]
        );
        roomCount += 1;

        for (const letter of ROOM_LETTERS) {
          for (const bed of BED_NUMBERS) {
            const unitId = `${roomId}-${letter}-${bed}`;
            await query(
              `INSERT INTO units
                 (id, room_id, room_letter, bed_number, occupied, resident_id,
                  block, room_number, floor)
               VALUES ($1, $2, $3, $4, FALSE, NULL, $5, $6, $7)
               ON CONFLICT (id) DO NOTHING`,
              [unitId, roomId, letter, bed, block, String(roomNumber), String(floor)]
            );
            unitCount += 1;
          }
        }
      }
    }
  }

  const rooms = await queryRow("SELECT COUNT(*)::int AS n FROM rooms");
  const units = await queryRow("SELECT COUNT(*)::int AS n FROM units");
  const free = await queryRow("SELECT COUNT(*)::int AS n FROM units WHERE occupied = FALSE");

  console.log("----------------------------------------------");
  console.log("[seed] SUMMARY");
  console.log(`  Rooms generated : ${roomCount} (in DB: ${rooms.n})`);
  console.log(`  Units generated : ${unitCount} (in DB: ${units.n}, free: ${free.n})`);
  console.log("----------------------------------------------");

  if (rooms.n !== 233 || units.n !== 1398) {
    console.warn(`[seed] WARNING: expected 233 rooms / 1398 units, found ${rooms.n} / ${units.n}.`);
    process.exitCode = 1;
  } else {
    console.log("[seed] VALIDATION PASSED: 233 rooms, 1398 bed slots.");
  }
}

main().catch((err) => {
  console.error("[seed] FATAL ERROR:", err);
  process.exit(1);
});
