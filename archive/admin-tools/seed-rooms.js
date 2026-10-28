/**
 * seed-rooms.js
 * ------------------------------------------------------------------
 * Standalone utility to populate the Firestore "rooms" collection for
 * the Corridor Hill Residence Maintenance System.
 *
 * This script is IDEMPOTENT: it is safe to run multiple times. It only
 * creates room documents that do NOT already exist (matched by the
 * deterministic document ID, e.g. "A101"), so re-running never
 * produces duplicates.
 *
 * It uses Firestore batch writes (max 500 operations per batch) and
 * performs a validation pass after generation.
 *
 * ── Relationship to units ─────────────────────────────────────────
 *   rooms/{roomId}   →  room-level METADATA ONLY (no occupancy).
 *   units/{unitId}   →  occupancy + resident assignment (unchanged).
 *
 *   Each room has exactly three unit documents (A, B, C):
 *     rooms "A101"  →  units "A101-A", "A101-B", "A101-C"
 *
 *   The rooms collection exists purely so the application can:
 *     - list available rooms (choose-room.js),
 *     - query rooms by block / floor,
 *     - display room information on dashboard / complaints / management.
 *
 * ── Schema per document ───────────────────────────────────────────
 *   block       : "A" | "B" | "C" | "D" | "E" | "F"
 *   floor       : numeric floor derived from roomNumber (1..5)
 *   roomNumber  : numeric room number (e.g. 101)
 *   roomId      : block + roomNumber (e.g. "A101")
 *   roomLabel   : "A101"
 *   createdAt   : Firestore serverTimestamp()
 *
 * ── Document ID format ────────────────────────────────────────────
 *   `${roomId}`  →  "A101", "A102", … "F513"
 *
 * ── Usage ─────────────────────────────────────────────────────────
 *   Because this is an ES module importing Firebase (loaded via CDN),
 *   serve the project folder and open a terminal, OR run it from the
 *   browser console on a page that shares the Firebase config.
 *
 *   The simplest approach: serve the root and load it as a module, e.g.
 *   via a temporary <script type="module" src="./seed-rooms.js">.
 *
 *   Expected totals (verified):
 *     Total rooms    = 250
 *     Total created  = 250 (first run)
 *     Total skipped  =   0 (first run)
 */

import { db } from "./js/firebase.js";
import { requireManagement } from "./js/seed-auth.js";
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ------------------------------------------------------------------ */
/* 1. BLOCK / ROOM LAYOUT                                             */
/* ------------------------------------------------------------------ */

/**
 * Describes the room layout for every block.
 * This MUST stay in sync with the layout in seed-units.js.
 *
 *   key   → block name
 *   value → array of { floor, start, end } ranges
 */
const BLOCK_LAYOUT = {
  // Blocks A, B, C: 4 floors × 9 rooms = 36 rooms each.
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

  // Block D: 4 floors × 8 rooms = 32 rooms.
  D: [
    { floor: 1, start: 101, end: 108 },
    { floor: 2, start: 201, end: 208 },
    { floor: 3, start: 301, end: 308 },
    { floor: 4, start: 401, end: 408 },
  ],

  // Blocks E, F: 5 floors × 55 rooms each (3 + 13×4 = 55).
  E: [
    { floor: 1, start: 101, end: 103 },
    { floor: 2, start: 201, end: 213 },
    { floor: 3, start: 301, end: 313 },
    { floor: 4, start: 401, end: 413 },
    { floor: 5, start: 501, end: 513 },
  ],
  F: [
    { floor: 1, start: 101, end: 103 },
    { floor: 2, start: 201, end: 213 },
    { floor: 3, start: 301, end: 313 },
    { floor: 4, start: 401, end: 413 },
    { floor: 5, start: 501, end: 513 },
  ],
};

/* ------------------------------------------------------------------ */
/* 2. GENERATION                                                       */
/* ------------------------------------------------------------------ */

/**
 * Build the full list of room descriptors (the "plan" to write).
 *
 * Each descriptor contains the deterministic document id and the data
 * payload for that room document. Room documents carry metadata ONLY —
 * no occupancy fields (occupancy lives in the units collection).
 */
function buildRoomDescriptors() {
  const descriptors = [];
  let roomCount = 0;

  for (const [block, floors] of Object.entries(BLOCK_LAYOUT)) {
    for (const { floor, start, end } of floors) {
      for (let roomNumber = start; roomNumber <= end; roomNumber++) {
        roomCount++;
        const roomId = `${block}${roomNumber}`;

        descriptors.push({
          id: roomId, // e.g. "A101"
          data: {
            block,
            floor,
            roomNumber,
            roomId,
            roomLabel: roomId, // e.g. "A101"
            createdAt: serverTimestamp(),
          },
        });
      }
    }
  }

  return { descriptors, roomCount };
}

/**
 * Fetch the set of existing room document IDs so we can skip them.
 * Reading once up-front keeps the script idempotent and cheap.
 */
async function loadExistingRoomIds() {
  const snap = await getDocs(collection(db, "rooms"));
  const ids = new Set(snap.docs.map((d) => d.id));
  return { ids, existingCount: ids.size };
}

/**
 * Write the pending room descriptors using Firestore batches.
 * Firestore allows at most 500 operations per batch, so we chunk.
 */
async function writeMissingRooms(descriptors, existingIds) {
  const toCreate = descriptors.filter((d) => !existingIds.has(d.id));
  let created = 0;

  const BATCH_LIMIT = 500;
  for (let i = 0; i < toCreate.length; i += BATCH_LIMIT) {
    const chunk = toCreate.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const room of chunk) {
      batch.set(doc(db, "rooms", room.id), room.data);
    }

    await batch.commit();
    created += chunk.length;
    console.log(
      `[seed-rooms] Batch written: ${created}/${toCreate.length} new rooms...`
    );
  }

  return created;
}

/* ------------------------------------------------------------------ */
/* 3. VALIDATION PASS                                                  */
/* ------------------------------------------------------------------ */

/**
 * Verify the generated collection:
 *   - exactly the expected number of room documents exist,
 *   - every room has block, floor, roomNumber, roomId, roomLabel,
 *   - no room document carries occupancy fields (metadata only),
 *   - every unit references a room that exists (no orphaned units),
 *   - every room id is unique (no duplicate room IDs).
 */
async function validate(expectedRooms = 250) {
  const roomsSnap = await getDocs(collection(db, "rooms"));
  const rooms = roomsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const unitsSnap = await getDocs(collection(db, "units"));
  const units = unitsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const errors = [];

  // 1. Room count.
  if (rooms.length !== expectedRooms) {
    errors.push(
      `Expected ${expectedRooms} room documents but found ${rooms.length}.`
    );
  }

  // 2. Required metadata fields per room.
  rooms.forEach((r) => {
    if (!r.block) errors.push(`${r.id}: missing block`);
    if (!r.floor) errors.push(`${r.id}: missing floor`);
    if (!r.roomNumber) errors.push(`${r.id}: missing roomNumber`);
    if (!r.roomId) errors.push(`${r.id}: missing roomId`);
    if (!r.roomLabel) errors.push(`${r.id}: missing roomLabel`);
  });

  // 3. Rooms must be metadata only — no occupancy fields.
  rooms.forEach((r) => {
    if (r.occupied !== undefined) {
      errors.push(`${r.id}: must NOT contain occupancy (occupied)`);
    }
    if (r.residentId !== undefined) {
      errors.push(`${r.id}: must NOT contain residentId`);
    }
    if (r.unitName !== undefined) {
      errors.push(`${r.id}: must NOT contain unitName`);
    }
  });

  // 4. No duplicate room IDs (document ids are unique by nature, but
  //    verify the roomId field matches the document id too).
  const roomIds = new Set();
  rooms.forEach((r) => {
    if (roomIds.has(r.roomId)) {
      errors.push(`Duplicate roomId in collection: ${r.roomId}`);
    }
    roomIds.add(r.roomId);
    if (r.id !== r.roomId) {
      errors.push(`${r.id}: roomId field (${r.roomId}) != document id`);
    }
  });

  // 5. Every unit references a valid room that exists (no orphaned units).
  units.forEach((u) => {
    if (!u.roomId) {
      errors.push(`Unit ${u.id}: missing roomId reference`);
    } else if (!roomIds.has(u.roomId)) {
      errors.push(`Unit ${u.id}: references missing room ${u.roomId} (orphaned unit)`);
    }
  });

  // 6. Every room is referenced by at least one unit (optional sanity check).
  const referenced = new Set(units.map((u) => u.roomId));
  rooms.forEach((r) => {
    if (!referenced.has(r.roomId)) {
      errors.push(`Room ${r.roomId}: not referenced by any unit`);
    }
  });

  if (errors.length > 0) {
    console.warn("[seed-rooms] VALIDATION FAILED:");
    errors.slice(0, 20).forEach((e) => console.warn("  - " + e));
    if (errors.length > 20) {
      console.warn(`  … and ${errors.length - 20} more issue(s).`);
    }
    return false;
  }

  console.log(
    `[seed-rooms] VALIDATION PASSED: ${rooms.length} rooms, ` +
      `${units.length} units, all references valid, no duplicates.`
  );
  return true;
}

/* ------------------------------------------------------------------ */
/* 4. ENTRY POINT                                                      */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("[seed-rooms] Starting room seed...");

  // Security guard: only a signed-in management user may write rooms.
  await requireManagement();

  // Generation plan.
  const { descriptors, roomCount } = buildRoomDescriptors();
  const roomTotal = descriptors.length;

  // Existing documents (idempotency).
  const { ids, existingCount } = await loadExistingRoomIds();
  console.log(
    `[seed-rooms] Existing room documents found: ${existingCount}`
  );

  // Write only the missing ones.
  const created = await writeMissingRooms(descriptors, ids);
  const skipped = roomTotal - created;

  // Final summary.
  console.log("----------------------------------------------");
  console.log("[seed-rooms] SUMMARY");
  console.log(`  Total rooms generated       : ${roomTotal}`);
  console.log(`  Total documents created     : ${created}`);
  console.log(`  Total documents skipped     : ${skipped}`);
  console.log("----------------------------------------------");

  // Validation pass (counts + cross-references with units).
  await validate(roomTotal);
  console.log("[seed-rooms] Done.");
}

main().catch((error) => {
  console.error("[seed-rooms] FATAL ERROR:", error);
  process.exitCode = 1;
});
