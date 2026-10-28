/**
 * scripts/retention-check.mjs — one-off verification of the retention job.
 * Ages one complaint to 20 days (expect archive) and another to 200 days
 * (expect delete), then restores/cleans up. Run: node scripts/retention-check.mjs
 */
import { query, queryRow, queryRows } from "../src/db.js";
import { runRetention, archiveAfterDays, deleteAfterDays } from "../src/services/retention.js";

const rows = await queryRows(
  `SELECT id, status, archived, updated_at FROM complaints
    WHERE (reopen_requested IS NOT TRUE) ORDER BY created_at DESC LIMIT 5`
);
if (rows.length < 1) {
  console.log("No complaints in DB — nothing to verify.");
  process.exit(0);
}

console.log(`policy: archiveAfter=${archiveAfterDays()}d deleteAfter=${deleteAfterDays()}d`);

// A: Completed 20 days ago -> must become archived.
const a = rows[0];
await query(
  `UPDATE complaints SET status='Completed', archived=FALSE, archived_at=NULL,
     updated_at = NOW() - INTERVAL '20 days' WHERE id=$1`,
  [a.id]
);
// B: Completed 200 days ago -> must be hard-deleted.
const b = rows[1];
let deleteWorked = true;
if (b) {
  await query(
    `UPDATE complaints SET status='Completed', archived=FALSE, archived_at=NULL,
       updated_at = NOW() - INTERVAL '200 days' WHERE id=$1`,
    [b.id]
  );
}

const dry = await runRetention({ dryRun: true });
console.log("dryRun:", JSON.stringify(dry));

const real = await runRetention();
console.log("real:", JSON.stringify(real));

const aAfter = await queryRow("SELECT archived FROM complaints WHERE id=$1", [a.id]);
console.log(`A (${a.id}): archived=${aAfter?.archived}  expected=TRUE`);
const bAfter = b ? await queryRow("SELECT id FROM complaints WHERE id=$1", [b.id]) : null;
console.log(`B (${b?.id}): ${bAfter ? "still present" : "deleted"}  expected=deleted`);

const ok = aAfter?.archived === true && !bAfter;
console.log(ok ? "RETENTION CHECK: PASS" : "RETENTION CHECK: FAIL");

// Restore A so the demo data stays normal.
await query(
  `UPDATE complaints SET status='Completed', archived=FALSE, archived_at=NULL,
     updated_at = NOW() WHERE id=$1`,
  [a.id]
);
process.exit(ok ? 0 : 1);
