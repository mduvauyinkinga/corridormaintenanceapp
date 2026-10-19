/**
 * One-time migration from F506-A records to F506-A-1 and F506-A-2 slots.
 * Run as management before publishing the updated room-selection code.
 */

import { db } from "./js/firebase.js";
import { requireManagement } from "./js/seed-auth.js";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const BATCH_LIMIT = 450;

function slotData(legacy, bedNumber) {
  return {
    ...legacy,
    roomLabel: `${legacy.roomId} Room ${legacy.roomLetter}, bed ${bedNumber}`,
    unitName: legacy.roomLetter,
    bedNumber,
    occupied: bedNumber === 1 ? legacy.occupied === true : false,
    residentId: bedNumber === 1 ? legacy.residentId || null : null,
    createdAt: legacy.createdAt || serverTimestamp(),
  };
}

async function main() {
  await requireManagement();

  const snapshot = await getDocs(collection(db, "units"));
  const units = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  const legacyUnits = units.filter((unit) => !Number.isInteger(unit.bedNumber));
  if (legacyUnits.length === 0) {
    console.log("[migrate-units] No legacy records found.");
    return;
  }

  const existing = new Map(units.map((unit) => [unit.id, unit]));
  const operations = [];
  legacyUnits.forEach((legacy) => {
    const letter = legacy.roomLetter || legacy.unitName;
    if (!legacy.roomId || !letter) throw new Error(`${legacy.id} has incomplete room data.`);

    const firstId = `${legacy.roomId}-${letter}-1`;
    const secondId = `${legacy.roomId}-${letter}-2`;
    const first = existing.get(firstId);
    if (first && first.residentId !== (legacy.residentId || null)) {
      throw new Error(`Conflict at ${firstId}; resolve it before migrating.`);
    }
    if (!first) operations.push({ type: "set", ref: doc(db, "units", firstId), data: slotData(legacy, 1) });
    if (!existing.has(secondId)) operations.push({ type: "set", ref: doc(db, "units", secondId), data: slotData(legacy, 2) });
    if (legacy.occupied === true && legacy.residentId) {
      operations.push({ type: "update", ref: doc(db, "users", legacy.residentId), data: { unitId: firstId } });
    }
    operations.push({ type: "delete", ref: doc(db, "units", legacy.id) });
  });

  for (let start = 0; start < operations.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations.slice(start, start + BATCH_LIMIT).forEach((operation) => {
      if (operation.type === "set") batch.set(operation.ref, operation.data);
      if (operation.type === "update") batch.update(operation.ref, operation.data);
      if (operation.type === "delete") batch.delete(operation.ref);
    });
    await batch.commit();
  }
  console.log(`[migrate-units] Converted ${legacyUnits.length} records.`);
}

main().catch((error) => console.error("[migrate-units] FATAL ERROR:", error));
