/**
 * verify-seed.js
 * ------------------------------------------------------------------
 * Standalone verification utility for the Corridor Hill room data.
 *
 * It reads the `rooms` and `units` collections and reports whether the
 * database is correctly seeded so the Choose Room workflow can run.
 *
 * Expected totals (current 2-beds-per-letter model):
 *   Rooms : 250
 *   Units : 1500 (250 rooms x 3 letters A/B/C x 2 beds = 6 slots per room)
 *
 * Checks performed:
 *   1. Count room documents (expect 250).
 *   2. Count unit documents (expect 1500).
 *   3. Every room has 6 bed slots (A-1, A-2, B-1, B-2, C-1, C-2).
 *   4. Every unit references a valid room (no orphaned units).
 *   5. No duplicate room IDs.
 *   6. No duplicate unit IDs.
 *   7. All required fields exist on every document.
 *   8. (Rooms) metadata-only — must NOT carry occupancy fields.
 *   9. (Units) occupied === false, residentId === null.
 *
 * Output:
 *   On success  → "✓ Database successfully seeded."
 *   On failure  → a detailed report of missing / inconsistent data.
 *
 * ── Usage ─────────────────────────────────────────────────────────
 *   This is an ES module. Load it from a served page while signed in
 *   as a management user (reads are allowed for any signed-in user,
 *   but the guard is kept for consistency with the seed scripts):
 *
 *     <script type="module" src="./verify-seed.js"></script>
 *
 *   Results are printed to the browser console.
 */

import { db } from "./js/firebase.js";
import { requireManagement } from "./js/seed-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const EXPECTED_ROOMS = 250;
const EXPECTED_UNITS = 1500;
const UNIT_LETTERS = ["A", "B", "C"];
const BED_NUMBERS = [1, 2];
const SLOTS_PER_ROOM = 6; // 3 letters x 2 beds

/** Collect all documents in a collection into an array. */
async function getAllDocs(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Run the full verification and return a list of issues (strings). */
function runChecks(rooms, units) {
  const errors = [];

  /* ---------- 1. Counts ---------- */
  if (rooms.length !== EXPECTED_ROOMS) {
    errors.push(
      `ROOM COUNT: expected ${EXPECTED_ROOMS} but found ${rooms.length}.`
    );
  }
  if (units.length !== EXPECTED_UNITS) {
    errors.push(
      `UNIT COUNT: expected ${EXPECTED_UNITS} but found ${units.length}.`
    );
  }

  /* ---------- 2. Duplicate room IDs ---------- */
  const roomIdSet = new Set();
  rooms.forEach((r) => {
    if (!r.roomId) return; // field check handled below
    if (roomIdSet.has(r.roomId)) {
      errors.push(`DUPLICATE roomId: ${r.roomId}`);
    }
    roomIdSet.add(r.roomId);
  });

  /* ---------- 3. Duplicate unit IDs ---------- */
  const unitIdSet = new Set();
  units.forEach((u) => {
    if (unitIdSet.has(u.id)) {
      errors.push(`DUPLICATE unit id: ${u.id}`);
    }
    unitIdSet.add(u.id);
  });

  /* ---------- 4. Required room fields ---------- */
  const REQUIRED_ROOM_FIELDS = ["block", "floor", "roomNumber", "roomId", "roomLabel"];
  rooms.forEach((r) => {
    REQUIRED_ROOM_FIELDS.forEach((field) => {
      if (r[field] === undefined || r[field] === null || r[field] === "") {
        errors.push(`ROOM ${r.id}: missing required field "${field}".`);
      }
    });

    // Rooms must be metadata only — no occupancy fields.
    if (r.occupied !== undefined) {
      errors.push(`ROOM ${r.id}: must NOT contain "occupied".`);
    }
    if (r.residentId !== undefined) {
      errors.push(`ROOM ${r.id}: must NOT contain "residentId".`);
    }
    if (r.unitName !== undefined) {
      errors.push(`ROOM ${r.id}: must NOT contain "unitName".`);
    }
  });

  /* ---------- 5. Required unit fields ---------- */
  const REQUIRED_UNIT_FIELDS = [
    "block",
    "roomNumber",
    "roomId",
    "roomLetter",
    "unitName",
    "bedNumber",
    "occupied",
    "residentId",
  ];
  units.forEach((u) => {
    REQUIRED_UNIT_FIELDS.forEach((field) => {
      if (u[field] === undefined || u[field] === null || u[field] === "") {
        errors.push(`UNIT ${u.id}: missing required field "${field}".`);
      }
    });

    if (u.roomLetter !== undefined && !UNIT_LETTERS.includes(u.roomLetter)) {
      errors.push(`UNIT ${u.id}: invalid roomLetter "${u.roomLetter}".`);
    }
    if (u.bedNumber !== undefined && !BED_NUMBERS.includes(u.bedNumber)) {
      errors.push(`UNIT ${u.id}: invalid bedNumber "${u.bedNumber}" (expected 1 or 2).`);
    }
    // Document ID must follow ${roomId}-${letter}-${bed}, e.g. F506-A-1.
    if (u.roomId && u.roomLetter && u.bedNumber !== undefined) {
      const expectedId = `${u.roomId}-${u.roomLetter}-${u.bedNumber}`;
      if (u.id !== expectedId) {
        errors.push(`UNIT ${u.id}: expected id "${expectedId}".`);
      }
    }
    if (u.occupied !== undefined && u.occupied !== false) {
      errors.push(`UNIT ${u.id}: occupied must be false (found ${u.occupied}).`);
    }
    if (u.residentId !== undefined && u.residentId !== null) {
      errors.push(`UNIT ${u.id}: residentId must be null (found ${u.residentId}).`);
    }
  });

  /* ---------- 6. Every unit references a valid room ---------- */
  const roomIds = new Set(rooms.map((r) => r.roomId));
  units.forEach((u) => {
    if (!u.roomId) return; // field check handled above
    if (!roomIds.has(u.roomId)) {
      errors.push(`UNIT ${u.id}: references missing room "${u.roomId}" (orphaned).`);
    }
  });

  /* ---------- 7. Every room has 6 bed slots (A-1, A-2, B-1, B-2, C-1, C-2) ---------- */
  const unitsByRoom = new Map();
  units.forEach((u) => {
    if (!u.roomId) return;
    if (!unitsByRoom.has(u.roomId)) unitsByRoom.set(u.roomId, []);
    unitsByRoom.get(u.roomId).push(u);
  });

  const expectedSlots = [];
  UNIT_LETTERS.forEach((letter) => {
    BED_NUMBERS.forEach((bed) => expectedSlots.push(`${letter}-${bed}`));
  });
  expectedSlots.sort();

  rooms.forEach((r) => {
    if (!r.roomId) return;
    const roomUnits = unitsByRoom.get(r.roomId) || [];
    const slots = roomUnits
      .map((u) => (u.roomLetter && u.bedNumber !== undefined ? `${u.roomLetter}-${u.bedNumber}` : ""))
      .sort();

    if (roomUnits.length !== SLOTS_PER_ROOM) {
      errors.push(
        `ROOM ${r.roomId}: expected ${SLOTS_PER_ROOM} bed slots but found ${roomUnits.length}.`
      );
    }
    if (JSON.stringify(slots) !== JSON.stringify(expectedSlots)) {
      errors.push(
        `ROOM ${r.roomId}: missing bed slot(s) — found [${slots.join(", ")}], expected [${expectedSlots.join(", ")}].`
      );
    }
  });

  return errors;
}

/** Print a human-readable summary to the console. */
function printSummary(rooms, units) {
  console.log("==============================================");
  console.log("        DATABASE VERIFICATION REPORT");
  console.log("==============================================");

  const byBlockRoom = new Map();
  rooms.forEach((r) => {
    if (!r.block) return;
    if (!byBlockRoom.has(r.block)) byBlockRoom.set(r.block, 0);
    byBlockRoom.set(r.block, byBlockRoom.get(r.block) + 1);
  });

  console.log(`Rooms total   : ${rooms.length} (expected ${EXPECTED_ROOMS})`);
  console.log(`Units total   : ${units.length} (expected ${EXPECTED_UNITS})`);
  console.log("----------------------------------------------");
  console.log("Rooms per block:");
  [...byBlockRoom.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([block, count]) => {
      console.log(`  Block ${block} : ${count} rooms`);
    });
  console.log("----------------------------------------------");
}

/** Entry point. */
async function main() {
  console.log("[verify-seed] Verifying rooms + units collections...");

  // Reads are allowed for any signed-in user; keep the guard for
  // consistency and to ensure a valid auth context.
  await requireManagement();

  const rooms = await getAllDocs("rooms");
  const units = await getAllDocs("units");

  printSummary(rooms, units);

  const errors = runChecks(rooms, units);

  if (errors.length === 0) {
    console.log("----------------------------------------------");
    console.log("✓ Database successfully seeded.");
    console.log(`  Rooms : ${rooms.length} (all valid, metadata-only)`);
    console.log(`  Units : ${units.length} (all valid, available)`);
    console.log("  All rooms match units, no duplicates, no orphans.");
    console.log("----------------------------------------------");
    return;
  }

  console.warn("----------------------------------------------");
  console.warn(`✗ DATABASE VERIFICATION FAILED — ${errors.length} issue(s) found:`);
  console.warn("----------------------------------------------");
  errors.slice(0, 50).forEach((e) => console.warn("  - " + e));
  if (errors.length > 50) {
    console.warn(`  … and ${errors.length - 50} more issue(s).`);
  }
  console.warn("----------------------------------------------");
  console.warn("Fix the data above, then re-run verify-seed.js until it passes.");
}

main().catch((error) => {
  console.error("[verify-seed] ERROR:", error);
});
