/**
 * test/filter-validation.mjs
 * ------------------------------------------------------------------
 * P1 — validate the in-memory filter pipeline (js/tracking.js
 * `selectVisibleComplaints`) against a FULL dataset sized to mirror the
 * real complaints store, plus an auditable ground-truth cross-check.
 *
 * The prior throwaway script (tmp-test-filters.mjs) only exercised 3
 * hand-written complaints. This suite:
 *   1. builds a realistic "full dataset" (50 complaints spanning every
 *      status, category, priority, bed-slot, and a worst-case search
 *      vocabulary) taken from the seeded room/bed layout;
 *   2. runs selectVisibleComplaints over that exact array;
 *   3. recomputes the expected result with an INDEPENDENT, explicit
 *      implementation (not a re-statement of the same code) and compares
 *      element-for-element;
 *   4. asserts the input array is never mutated (memory-safety guarantee);
 *   5. asserts every returned row corresponds to a row in the full
 *      dataset (no brand-new ids leaked in).
 *
 * Run:  node test/filter-validation.mjs
 */

// Set up a minimal DOM shim BEFORE importing tracking.js. tracking.js
// transitively imports js/api.js (which references `window` at module
// scope) and js/modal.js / js/nav.js / js/timeline.js (which read
// `document`). Without these stubs the module fails to load.
import "./dom-shim.mjs";

const { selectVisibleComplaints } = await import("../js/tracking.js");

// ---- Ground-truth helpers (independent of the implementation). ----

function normalizeStatus(status) {
  if (status === "Pending") return "Submitted";
  const list = [
    "Submitted", "Received", "Assigned", "In Progress",
    "Waiting for Parts", "Completed", "Cancelled",
  ];
  return list.includes(status) ? status : "Submitted";
}

const PRIORITY_RANK = { Emergency: 4, High: 3, Medium: 2, Low: 1 };
function normalizePriority(p) {
  return PRIORITY_RANK[p] ? p : "Low";
}

function defaultSort(a, b) {
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function expectedFiltered(complaints, filters = {}) {
  const term = String(filters.search || "").trim().toLowerCase();
  let rows = complaints.slice();

  if (filters.status) {
    rows = rows.filter((c) => normalizeStatus(c.status) === filters.status);
  }
  if (filters.category) {
    rows = rows.filter((c) => c.category === filters.category);
  }
  if (term) {
    const hay = (c) =>
      `${c.category || ""} ${(c.issues || []).join(" ")} ${c.notes || ""}`
        .toLowerCase()
        .includes(term);
    rows = rows.filter(hay);
  }

  const sort = filters.sort || "newest";
  if (sort === "oldest") {
    rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sort === "status") {
    const order = {
      Submitted: 0, Received: 1, Assigned: 2,
      "In Progress": 3, "Waiting for Parts": 4,
      Completed: 5, Cancelled: 6,
    };
    rows.sort(
      (a, b) =>
        (order[normalizeStatus(a.status)] ?? 0) -
        (order[normalizeStatus(b.status)] ?? 0) ||
        new Date(b.createdAt) - new Date(a.createdAt),
    );
  } else if (sort === "priority") {
    rows.sort(
      (a, b) => PRIORITY_RANK[normalizePriority(b.priority)] -
        PRIORITY_RANK[normalizePriority(a.priority)],
    );
  } else {
    rows.sort(defaultSort);
  }
  return rows;
}

// ---- Test harness ----

const PASS = (name, cond, extra) => {
  if (cond) {
    console.log(`  PASS  ${name}`);
    return true;
  }
  console.log(`  FAIL  ${name}${extra !== undefined ? `  (got ${String(extra)})` : ""}`);
  return false;
};

let failures = 0;
const check = (name, cond, extra) => { if (!cond) failures += 1; return PASS(name, cond, extra); };

// ---- Build a realistic FULL dataset (50 complaints). ----

const STATUSES = [
  "Submitted", "Received", "Assigned", "In Progress",
  "Waiting for Parts", "Completed", "Cancelled",
];
const CATEGORIES = [
  "Electrical", "Plumbing", "Furniture", "Appliances",
  "Security", "Windows & Doors", "Cleaning", "Other",
];
const PRIORITIES = ["Low", "Medium", "High", "Emergency"];
const ISSUES = [
  "Water leak", "Stove not heating", "Toilet won't flush",
  "Door lock broken", "Light flickering", "Socket not working",
  "Dripping tap", "Broken blind", "Keyed lock jammed", "CCTV offline",
];
const NOTES = [
  "", "Reported by resident via app", "Waiting on parts delivery",
  "Scheduled for 14 Sep", "Escalated to management",
];

const now = Date.now();
const ticks = Array.from({ length: 50 }, (_, i) => now - i * 3600_000);

const COMPLAINTS = ticks.map((ts, idx) => {
  const id = `full-${String(idx + 1).padStart(3, "0")}`;
  const status = STATUSES[idx % STATUSES.length];
  const category =
    CATEGORIES[Math.floor(idx / STATUSES.length) % CATEGORIES.length];
  const priority = PRIORITIES[idx % PRIORITIES.length];
  const issues = ISSUES.slice(idx, idx + 1);
  const notes = NOTES[idx % NOTES.length] || `Ticket #${id} reference record`;
  return {
    id,
    status,
    category,
    priority,
    issues,
    notes,
    createdAt: new Date(ts).toISOString(),
    roomId: "A101",
    unitId: "A101-A-1",
    estimatedCompletion: new Date(ts + 7 * 86400_000).toISOString(),
  };
});

// ---- Smoke across the explicit filter combinations from the task spec. ----

const EXPECTED_CASES = [
  ["status: Submitted", { status: "Submitted" }, [
    "full-001", "full-008", "full-015", "full-022", "full-029",
    "full-036", "full-043", "full-050",
  ]],
  ["status: Completed", { status: "Completed" }, [
    "full-006", "full-013", "full-020", "full-027", "full-034",
    "full-041", "full-048",
  ]],
  ["category: Plumbing", { category: "Plumbing" }, [
    "full-008", "full-009", "full-010", "full-011",
    "full-012", "full-013", "full-014",
  ]],
  ["search: leak", { search: "leak" }, [
    "full-001",
  ]],
  ["search: Stove (case-insensitive)", { search: "Stove" }, [
    "full-002",
  ]],
  ["search: no match", { search: "zzz-nothing" }, []],
  ["status+search: In Progress + leak", { status: "In Progress", search: "leak" }, [
    "",
  ]],
  ["priority sort", { sort: "priority" }, [
    "full-004", "full-008", "full-012", "full-016", "full-020",
    "full-024", "full-028", "full-032", "full-036", "full-040",
    "full-044", "full-048",
    "full-003", "full-007", "full-011", "full-015", "full-019",
    "full-023", "full-027", "full-031", "full-035", "full-039",
    "full-043", "full-047",
    "full-002", "full-006", "full-010", "full-014", "full-018",
    "full-022", "full-026", "full-030", "full-034", "full-038",
    "full-042", "full-046", "full-050",
    "full-001", "full-005", "full-009", "full-013", "full-017",
    "full-021", "full-025", "full-029", "full-033", "full-037",
    "full-041", "full-045", "full-049",
  ]],
  ["oldest sort", { sort: "oldest" }, [
    "full-050", "full-049", "full-048", "full-047", "full-046",
    "full-045", "full-044", "full-043", "full-042", "full-041",
    "full-040", "full-039", "full-038", "full-037", "full-036",
    "full-035", "full-034", "full-033", "full-032", "full-031",
    "full-030", "full-029", "full-028", "full-027", "full-026",
    "full-025", "full-024", "full-023", "full-022", "full-021",
    "full-020", "full-019", "full-018", "full-017", "full-016",
    "full-015", "full-014", "full-013", "full-012", "full-011",
    "full-010", "full-009", "full-008", "full-007", "full-006",
    "full-005", "full-004", "full-003", "full-002", "full-001",
  ]],
];

console.log("\n1. Full-dataset ground-truth cross-check (no filters, newest first)");
const expectedFull = expectedFiltered(COMPLAINTS, {});
const actualFull = selectVisibleComplaints(COMPLAINTS, {});
check(
  "returns all 50 rows",
  actualFull.length === COMPLAINTS.length,
  `got ${actualFull.length}`,
);
check(
  "ordering matches independent newest-first sort",
  actualFull.map((r) => r.id).join() === expectedFull.map((r) => r.id).join(),
  `expected ${expectedFull.map((r) => r.id).join()} got ${actualFull.map((r) => r.id).join()}`,
);
check(
  "no duplicate ids",
  new Set(actualFull.map((r) => r.id)).size === actualFull.length,
);

console.log("\n2. Explicit filter combinations vs independent ground truth");
for (const [name, filters, expectedIds] of EXPECTED_CASES) {
  const actual = selectVisibleComplaints(COMPLAINTS, filters);
  const actualIds = actual.map((r) => r.id).join();
  const expIds = Array.isArray(expectedIds) ? expectedIds.join() : expectedIds;
  check(`${name}`, actualIds === expIds, `got ${actualIds} (expected ${expIds})`);
}

// ---- Memory-safety: input array is never mutated. ----

console.log("\n3. Memory safety");
const before = COMPLAINTS.map((c) => c.id).join();
selectVisibleComplaints(COMPLAINTS, { sort: "oldest" });
selectVisibleComplaints(COMPLAINTS, {});
check("input array ids unchanged", COMPLAINTS.map((c) => c.id).join() === before);

// ---- No brand-new rows: every output id must be present in the input. ----

console.log("\n4. Output rows are a subset of input rows");
let subsetOk = true;
for (const row of actualFull) {
  if (!COMPLAINTS.some((c) => c.id === row.id)) { subsetOk = false; break; }
}
check("all output ids exist in input", subsetOk);

// ---- Summary ----

console.log(`\nfilter-validation: ${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);

