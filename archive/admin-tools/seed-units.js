/**
 * seed-units.js
 * ------------------------------------------------------------------
 * Standalone utility to populate the Firestore "units" collection for
 * the Corridor Hill Residence Maintenance System.
 *
 * This script is IDEMPOTENT: it is safe to run multiple times. It only
 * creates unit documents that do NOT already exist (matched by a
 * deterministic document ID like "A101-A-1"), so re-running never
 * produces duplicates.
 *
 * It uses Firestore batch writes (max 500 operations per batch) and
 * performs a validation pass after generation.
 *
 * ── Schema per document ────────────────────────────────────────────
 *   block       : "A" | "B" | "C" | "D" | "E" | "F"
 *   floor       : numeric floor derived from roomNumber (1..5)
 *   roomNumber  : numeric room number (e.g. 101)
 *   roomId      : block + roomNumber (e.g. "A101")
 *   roomLabel   : "A101 Room A, bed 1"
 *   roomLetter  : "A" | "B" | "C"
 *   bedNumber   : 1 | 2
 *   unitName    : "A" | "B" | "C"   (backwards compatibility with app)
 *   occupied    : false
 *   residentId  : null
 *   createdAt   : Firestore serverTimestamp()
 *
 * ── Document ID format ─────────────────────────────────────────────
 *   `${roomId}-${roomLetter}-${bedNumber}`  →  "A101-A-1", "A101-A-2"
 *
 * ── Usage ──────────────────────────────────────────────────────────
 *   Because this is an ES module importing Firebase (loaded via CDN),
 *   serve the project folder and open a terminal, OR run it from the
 *   browser console on a page that shares the Firebase config.
 *
 *   The simplest approach: serve the root and load it as a module, e.g.
 *   via a temporary <script type="module" src="./seed-units.js">.
 *
 *   Expected totals (verified):
 *     Total rooms    = 250
 *     Total units    = 1,500 (250 parent rooms x 3 rooms x 2 beds)
 *     Total created  = 1,500 (first run)
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
 * Each entry maps a floor to the range of room numbers on that floor.
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

/** Each parent room has A, B and C; each of those rooms has two beds. */
const UNIT_LETTERS = ["A", "B", "C"];
const BED_NUMBERS = [1, 2];

/* ------------------------------------------------------------------ */
/* 2. GENERATION                                                       */
/* ------------------------------------------------------------------ */

/**
 * Build the full list of unit descriptors (the "plan" to write).
 *
 * Each descriptor contains the deterministic document id and the data
 * payload for that unit document.
 */
function buildUnitDescriptors() {
  const descriptors = [];
  let roomCount = 0;

  for (const [block, floors] of Object.entries(BLOCK_LAYOUT)) {
    for (const { floor, start, end } of floors) {
      for (let roomNumber = start; roomNumber <= end; roomNumber++) {
        roomCount++;
        const roomId = `${block}${roomNumber}`;

        for (const letter of UNIT_LETTERS) {
          for (const bedNumber of BED_NUMBERS) {
            descriptors.push({
              id: `${roomId}-${letter}-${bedNumber}`, // e.g. "A101-A-1"
              data: {
                block,
                floor,
                roomNumber,
                roomId,
                roomLabel: `${roomId} Room ${letter}, bed ${bedNumber}`,
                roomLetter: letter,
                unitName: letter, // backwards compatibility with app
                bedNumber,
                occupied: false,
                residentId: null,
                createdAt: serverTimestamp(),
              },
            });
          }
        }
      }
    }
  }

  return { descriptors, roomCount };
}

/**
 * Fetch the set of existing unit document IDs so we can skip them.
 * Reading once up-front keeps the script idempotent and cheap.
 */
async function loadExistingUnitIds() {
  const snap = await getDocs(collection(db, "units"));
  const ids = new Set(snap.docs.map((d) => d.id));
  return { ids, existingCount: ids.size };
}

/**
 * Write the pending unit descriptors using Firestore batches.
 * Firestore allows at most 500 operations per batch, so we chunk.
 */
async function writeMissingUnits(descriptors, existingIds) {
  const toCreate = descriptors.filter((d) => !existingIds.has(d.id));
  let created = 0;

  const BATCH_LIMIT = 500;
  for (let i = 0; i < toCreate.length; i += BATCH_LIMIT) {
    const chunk = toCreate.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const unit of chunk) {
      batch.set(doc(db, "units", unit.id), unit.data);
    }

    await batch.commit();
    created += chunk.length;
    console.log(
      `[seed-units] Batch written: ${created}/${toCreate.length} new units...`
    );
  }

  return created;
}

/* ------------------------------------------------------------------ */
/* 3. VALIDATION PASS                                                  */
/* ------------------------------------------------------------------ */

/**
 * Verify the generated collection:
 *   - exactly 1,500 bed-slot documents exist
 *   - every doc has roomLetter and unitName
 *   - every doc is occupied === false
 *   - every doc has residentId === null
 */
async function validate(collectionsRoot = db, expectedTotal = 1500) {
  const snap = await getDocs(collection(collectionsRoot, "units"));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const errors = [];
  if (docs.length !== expectedTotal) {
    errors.push(
      `Expected ${expectedTotal} unit documents but found ${docs.length}.`
    );
  }

  docs.forEach((u) => {
    if (!u.roomLetter) errors.push(`${u.id}: missing roomLetter`);
    if (!u.unitName) errors.push(`${u.id}: missing unitName`);
    if (![1, 2].includes(u.bedNumber)) errors.push(`${u.id}: invalid bedNumber`);
    if (u.occupied !== false) errors.push(`${u.id}: occupied is not false`);
    if (u.residentId !== null) errors.push(`${u.id}: residentId is not null`);
  });

  if (errors.length > 0) {
    console.warn("[seed-units] VALIDATION FAILED:");
    errors.slice(0, 20).forEach((e) => console.warn("  - " + e));
    if (errors.length > 20) {
      console.warn(`  … and ${errors.length - 20} more issue(s).`);
    }
    return false;
  }

  console.log(`[seed-units] VALIDATION PASSED: ${docs.length} bed slots.`);
  return true;
}

/* ------------------------------------------------------------------ */
/* 4. ENTRY POINT                                                      */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("[seed-units] Starting unit seed...");

  // Security guard: only a signed-in management user may write units.
  await requireManagement();

  // Generation plan.
  const { descriptors, roomCount } = buildUnitDescriptors();
  const unitTotal = descriptors.length;

  // Existing documents (idempotency).
  const { ids, existingCount } = await loadExistingUnitIds();
  console.log(
    `[seed-units] Existing unit documents found: ${existingCount}`
  );

  // Write only the missing ones.
  const created = await writeMissingUnits(descriptors, ids);
  const skipped = unitTotal - created;

  // Final summary.
  console.log("----------------------------------------------");
  console.log("[seed-units] SUMMARY");
  console.log(`  Total rooms generated       : ${roomCount}`);
  console.log(`  Total units generated       : ${unitTotal}`);
  console.log(`  Total documents created     : ${created}`);
  console.log(`  Total documents skipped     : ${skipped}`);
  console.log("----------------------------------------------");

  // Validation pass.
  await validate(db);
  console.log("[seed-units] Done.");
}

main().catch((error) => {
  console.error("[seed-units] FATAL ERROR:", error);
  process.exitCode = 1;
});
