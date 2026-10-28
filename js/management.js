/**
 * management.js
 * ------------------------------------------------------------------
 * Management dashboard logic (self-coded backend version).
 *
 * - Guarded to the `management` role only.
 * - Loads users + rooms + units + complaints via two admin endpoints
 *   (cached in memory) and derives all statistics, search, filters,
 *   sorting and drill-downs client-side — same behaviour as before,
 *   no Firestore reads.
 * - Complaint details modal with the status workflow; notes + timeline
 *   via the complaints endpoints; shared room updates via announcements.
 * - Residents tab (searchable).
 */

import { api, resolvePhotoURL } from "./api.js";
import { requireRole, warnIfSessionExpiring } from "./auth.js";
import { renderNav } from "./nav.js";
import { loadTimeline, renderTimeline } from "./timeline.js";
import { closeModal as a11yCloseModal, openModal as a11yOpenModal } from "./modal.js";
import {
  formatDate,
  formatDateTime,
  statusBadge,
  normalizeStatus,
  normalizePriority,
  priorityBadge,
  isOverdue,
  COMPLAINT_STATUSES,
  toast,
  $,
} from "./utils.js";

/* ------------------------------ State cache ------------------------------ */

// Cached collections (fetched once). Maps enable O(1) joins.
let usersMap = {};    // uid -> user doc
let roomsMap = {};    // roomId -> room doc
let unitsMap = {};    // unitId -> unit doc
let unitsByRoom = {}; // roomId -> [unit docs]
let complaints = [];  // [{ id, ...data }]

let currentProfile = null;
let activeComplaintId = null; // currently open in the modal
let selectedBlock = ""; // block letter selected in unit profiles block picker

/**
 * Return the current bed slots for one parent room. Modern data has two
 * slots (bed 1 and 2) for each lettered sub-room. If a migration left the
 * old single-slot documents behind, prefer the modern slots so they cannot
 * inflate capacity in the management dashboard.
 */
function getRoomBedSlots(units) {
  const byLetter = new Map();

  units.forEach((unit) => {
    const letter = unit.roomLetter || unit.unitName;
    if (!letter) return;
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter).push(unit);
  });

  return Array.from(byLetter.values()).flatMap((letterUnits) => {
    const modernSlots = letterUnits
      .filter((unit) => unit.bedNumber === 1 || unit.bedNumber === 2)
      .sort((a, b) => a.bedNumber - b.bedNumber);

    // A migrated letter has exactly these two slots. Old records are used
    // only as a fallback for databases that have not yet been migrated.
    return modernSlots.length > 0 ? modernSlots : letterUnits.slice(0, 1);
  });
}

/** Group bed slots into the three resident sub-rooms (A, B and C). */
function getSubRooms(units) {
  const groups = new Map();
  getRoomBedSlots(units).forEach((slot) => {
    const letter = slot.roomLetter || slot.unitName || "?";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(slot);
  });
  return Array.from(groups.entries())
    .map(([letter, slots]) => ({ letter, slots }))
    .sort((a, b) => a.letter.localeCompare(b.letter));
}
/* ------------------------------ DOM refs --------------------------------- */

const complaintsBody = $("#complaints-body");
const complaintsLoading = $("#complaints-loading");
const complaintsEmpty = $("#complaints-empty");

const residentsGrid = $("#residents-grid");
const residentsLoading = $("#residents-loading");
const residentsEmpty = $("#residents-empty");

const unitsGrid = $("#units-grid");
const unitsEmpty = $("#units-empty");
const unitSearch = $("#unit-search");
const unitStatus = $("#unit-status");
const unitsToolbar = $("#units-toolbar");
const unitsBlockPicker = $("#units-block-picker");
const unitsBlockGrid = $("#units-block-grid");
const unitsBlockView = $("#units-block-view");
const unitsBlockTitle = $("#units-block-title");
const unitsBack = $("#units-back");

const unitModal = $("#unit-modal");
const unitModalTitle = $("#unit-modal-title");
const unitModalSummary = $("#unit-modal-summary");
const unitModalResidents = $("#unit-modal-residents");
const unitModalComplaints = $("#unit-modal-complaints");
const unitModalAnnouncements = $("#unit-modal-announcements");
const unitAnnouncementForm = $("#unit-announcement-form");
const unitAnnouncementInput = $("#unit-announcement-input");
const unitAnnouncementSubmit = $("#unit-announcement-submit");
let activeUnitRoomId = null;

const tabComplaintsBtn = $("#tab-complaints");
const tabResidentsBtn = $("#tab-residents");
const tabUnitsBtn = $("#tab-units");
const viewComplaints = $("#view-complaints");
const viewResidents = $("#view-residents");
const viewUnits = $("#view-units");

const searchInput = $("#search-input");
const filterStatus = $("#filter-status");
const filterCategory = $("#filter-category");
const filterBlock = $("#filter-block");
const filterFloor = $("#filter-floor");
const filterDate = $("#filter-date");
const sortBy = $("#sort-by");

const residentSearch = $("#resident-search");

const modal = $("#complaint-modal");
const modalDetails = $("#modal-details");
const modalStatusBadge = $("#modal-status-badge");
const modalStatusSelect = $("#modal-status-select");
const modalPrioritySelect = $("#modal-priority-select");
const modalEstimated = $("#modal-estimated");
const modalActual = $("#modal-actual");
const modalPhotos = $("#modal-photos");
const modalTimeline = $("#modal-timeline");
const reopenReview = $("#reopen-review");
const notesList = $("#notes-list");
const noteForm = $("#note-form");
const noteInput = $("#note-input");
const noteSubmit = $("#note-submit");

/* ------------------------------ Data loading ----------------------------- */

/**
 * Fetch users + rooms + units + complaints and cache them in memory.
 * Two admin round trips (users, overview); everything else is derived.
 */
async function loadAllData() {
  complaintsLoading.classList.remove("hidden");
  residentsLoading.classList.remove("hidden");

  const [usersData, overview] = await Promise.all([
    api("/admin/users", { auth: true }),
    api(`/admin/overview${includeArchived ? "?includeArchived=true" : ""}`, { auth: true }),
  ]);

  usersMap = {};
  (Array.isArray(usersData.users) ? usersData.users : []).forEach((u) => {
    usersMap[u.uid] = u;
  });

  roomsMap = {};
  (Array.isArray(overview.rooms) ? overview.rooms : []).forEach((r) => {
    roomsMap[r.id] = r;
  });

  unitsMap = {};
  unitsByRoom = {};
  (Array.isArray(overview.units) ? overview.units : []).forEach((unit) => {
    unitsMap[unit.id] = unit;
    if (!unitsByRoom[unit.roomId]) unitsByRoom[unit.roomId] = [];
    unitsByRoom[unit.roomId].push(unit);
  });

  complaints = Array.isArray(overview.complaints) ? overview.complaints : [];

  complaintsLoading.classList.add("hidden");
  residentsLoading.classList.add("hidden");
}

/**
 * Repair bed slots left occupied by a deleted resident profile.
 * Server-side single query (replaces the Cloud Function + client batch).
 */
async function releaseOrphanedUnits() {
  const data = await api("/admin/release-orphans", { method: "POST" });
  const released = Number(data.released) || 0;
  if (released > 0) {
    const overview = await api(`/admin/overview${includeArchived ? "?includeArchived=true" : ""}`, { auth: true });
    unitsMap = {};
    unitsByRoom = {};
    (Array.isArray(overview.units) ? overview.units : []).forEach((unit) => {
      unitsMap[unit.id] = unit;
      if (!unitsByRoom[unit.roomId]) unitsByRoom[unit.roomId] = [];
      unitsByRoom[unit.roomId].push(unit);
    });
    complaints = Array.isArray(overview.complaints) ? overview.complaints : [];
  }
  return released;
}

/* --------------------------- Lookup helpers ------------------------------ */

function getResident(uid) {
  return usersMap[uid] || null;
}

function getRoomOf(complaint) {
  const roomId = complaint.roomId;
  return (roomId && roomsMap[roomId]) || null;
}

function getUnitOf(complaint) {
  if (complaint.unitId && unitsMap[complaint.unitId]) {
    return unitsMap[complaint.unitId];
  }
  const room = getRoomOf(complaint);
  if (room && unitsByRoom[room.id] && unitsByRoom[room.id].length > 0) {
    return unitsByRoom[room.id][0];
  }
  return null;
}

/** Resolve all display fields for a complaint row/card. */
function resolveComplaintRow(c) {
  const resident = getResident(c.residentId);
  const room = getRoomOf(c);
  const unit = getUnitOf(c);
  return {
    id: c.id,
    shortId: c.id ? c.id.slice(0, 8).toUpperCase() : "—",
    name: resident?.name || "Unknown",
    studentNumber: resident?.studentNumber || "—",
    email: resident?.email || "",
    block: unit?.block || room?.block || "—",
    roomNumber: unit?.roomNumber ?? room?.roomNumber ?? "—",
    roomLetter: unit?.roomLetter || unit?.unitName || "—",
    issues: Array.isArray(c.issues) ? c.issues.join(", ") : String(c.issues || "—"),
    status: normalizeStatus(c.status),
    category: c.category || "—",
    priority: normalizePriority(c.priority),
    photoURLs: Array.isArray(c.photoURLs) ? c.photoURLs : [],
    estimatedCompletion: c.estimatedCompletion || null,
    actualCompletion: c.actualCompletion || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    archived: c.archived === true,
    archivedAt: c.archivedAt || null,
    notes: c.notes || "",
    residentId: c.residentId,
    roomId: c.roomId,
    unitId: c.unitId,
  };
}

function ts(dateLike) {
  if (!dateLike) return 0;
  if (typeof dateLike.toDate === "function") return dateLike.toDate().getTime();
  if (dateLike.seconds) return dateLike.seconds * 1000;
  return new Date(dateLike).getTime();
}


/* ------------------------------ Stats cards ------------------------------ */

function renderStats() {
  const residents = Object.values(usersMap).filter((u) => u.role === "resident");

  const isOpen = (c) => {
    const s = normalizeStatus(c.status);
    return s !== "Completed" && s !== "Cancelled";
  };
  const open = complaints.filter(isOpen);
  const overdue = complaints.filter((c) => isOverdue(c));
  const staleThreshold = Date.now() - 48 * 60 * 60 * 1000;
  const unassigned = complaints.filter((c) => {
    const s = normalizeStatus(c.status);
    if (s !== "Submitted" && s !== "Received") return false;
    return ts(c.createdAt) > 0 && ts(c.createdAt) < staleThreshold;
  });
  const emergency = complaints.filter((c) => normalizePriority(c.priority) === "Emergency" && isOpen(c));
  const completed = complaints.filter((c) => normalizeStatus(c.status) === "Completed");

  const setStat = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };
  setStat("stat-open", open.length);
  setStat("stat-overdue", overdue.length);
  setStat("stat-unassigned", unassigned.length);
  setStat("stat-emergency", emergency.length);
  setStat("stat-completed", completed.length);
  setStat("stat-residents", residents.length);
}

/* ------------------------- SLA quick filters ---------------------------- */

// Active SLA queue filter: "open" (default) | "" | "overdue" | "unassigned" | "emergency" | "archived".
// Defaults to "open" so Completed/Cancelled don't clutter the queue.
// "archived" shows only archived rows (fetched via ?includeArchived=true).
let slaFilter = "open";
// When true, /admin/overview is fetched with ?includeArchived=true.
let includeArchived = false;
// Pagination: 25 rows per page so management never scrolls hundreds of rows.
const PAGE_SIZE = 25;
let currentPage = 1;
// Currently selected complaint ids for bulk actions.
const selectedIds = new Set();
// Last filtered (unpaginated) rows + last rendered page — the CSV export target.
let lastFilteredRows = [];
let lastRenderedRows = [];

function matchesSla(row) {
  if (slaFilter === "archived") return row.archived === true;
  // Archived rows never leak into the active queues.
  if (row.archived === true) return false;
  if (!slaFilter) return true;
  const isOpen = row.status !== "Completed" && row.status !== "Cancelled";
  if (slaFilter === "open") return isOpen;
  if (slaFilter === "overdue") {
    if (!isOpen) return false;
    const est = row.estimatedCompletion ? new Date(row.estimatedCompletion) : null;
    if (est && !Number.isNaN(est.getTime())) {
      const end = new Date(est);
      end.setHours(23, 59, 59, 999);
      return end.getTime() < Date.now();
    }
    return false;
  }
  if (slaFilter === "unassigned") {
    if (row.status !== "Submitted" && row.status !== "Received") return false;
    return ts(row.createdAt) > 0 && ts(row.createdAt) < Date.now() - 48 * 60 * 60 * 1000;
  }
  if (slaFilter === "emergency") return normalizePriority(row.priority) === "Emergency" && isOpen;
  return true;
}

async function setSlaFilter(value) {
  slaFilter = value || "";
  const wantArchived = slaFilter === "archived";
  document.querySelectorAll("[data-sla-filter]").forEach((el) => {
    const active = (el.dataset.slaFilter || "") === slaFilter;
    el.classList.toggle("is-active", active);
    if (el.classList.contains("chip")) el.setAttribute("aria-pressed", String(active));
  });
  // Keep the status dropdown honest: an SLA queue overrides manual status.
  if (slaFilter && filterStatus) filterStatus.value = "";
  // The Archived queue needs rows the default overview excludes — refetch once.
  if (wantArchived && !includeArchived) {
    includeArchived = true;
    await reloadComplaints();
    return;
  }
  currentPage = 1;
  refreshComplaintsView();
}

/** Re-fetch users/overview (honouring the archived toggle) + repaint. */
async function reloadComplaints() {
  const [usersData, overview] = await Promise.all([
    api("/admin/users", { auth: true }),
    api(`/admin/overview${includeArchived ? "?includeArchived=true" : ""}`, { auth: true }),
  ]);
  usersMap = {};
  (Array.isArray(usersData.users) ? usersData.users : []).forEach((u) => {
    usersMap[u.uid] = u;
  });
  complaints = Array.isArray(overview.complaints) ? overview.complaints : [];
  currentPage = 1;
  renderStats();
  refreshComplaintsView();
  renderResidents();
}

/* ------------------------------ CSV export ------------------------------ */

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportFilteredCSV() {
  const rows = lastFilteredRows.length ? lastFilteredRows : complaints.map(resolveComplaintRow);
  const header = ["ID", "Resident", "Student No", "Email", "Block", "Room", "Unit", "Category", "Issues", "Status", "Priority", "Date", "Estimated", "Actual", "Archived"];
  const lines = [header.map(csvEscape).join(",")];
  rows.forEach((r) => {
    lines.push(
      [
        r.shortId, r.name, r.studentNumber, r.email, r.block, r.roomNumber,
        r.roomLetter, r.category, r.issues, r.status,
        normalizePriority(r.priority), formatDate(r.createdAt),
        r.estimatedCompletion ? formatDate(r.estimatedCompletion) : "",
        r.actualCompletion ? formatDate(r.actualCompletion) : "",
        r.archived ? "Yes" : "",
      ].map(csvEscape).join(",")
    );
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `corridor-complaints${slaFilter ? `-${slaFilter}` : ""}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`Exported ${rows.length} complaint${rows.length === 1 ? "" : "s"} to CSV.`, "success");
}

/* --------------------------- Complaints view ----------------------------- */

/** Convert a Date / timestamp / ISO string to "YYYY-MM-DD". */
function toDateInputValue(dateLike) {
  if (!dateLike) return "";
  const date =
    typeof dateLike.toDate === "function"
      ? dateLike.toDate()
      : dateLike instanceof Date
        ? dateLike
        : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Priority rank for sorting (Emergency first). */
function priorityRank(p) {
  return { Emergency: 0, High: 1, Medium: 2, Low: 3 }[normalizePriority(p)] ?? 3;
}

/** Apply the toolbar filters + sort, then render the current page. */
function refreshComplaintsView() {
  const term = (searchInput?.value || "").trim().toLowerCase();
  const statusVal = filterStatus?.value || "";
  const categoryVal = filterCategory?.value || "";
  const blockVal = filterBlock?.value || "";
  const floorVal = filterFloor?.value || "";
  const dateVal = filterDate?.value || "";
  const sortVal = sortBy?.value || "newest";

  let rows = complaints.map(resolveComplaintRow);

  // SLA queue filter applies first, then the manual toolbar filters narrow it.
  rows = rows.filter(matchesSla);

  if (term) {
    rows = rows.filter((r) =>
      [r.name, r.studentNumber, r.email, r.issues, r.category, r.shortId, r.block, String(r.roomNumber)]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }
  if (statusVal) rows = rows.filter((r) => r.status === statusVal);
  if (categoryVal) rows = rows.filter((r) => r.category === categoryVal);
  if (blockVal) rows = rows.filter((r) => r.block === blockVal);
  if (floorVal) rows = rows.filter((r) => String(r.roomNumber).startsWith(floorVal));
  // The Date Submitted control is a real date picker (YYYY-MM-DD) — match the
  // complaint's calendar day exactly (the old today/week/month check never ran).
  if (dateVal) {
    rows = rows.filter((r) => toDateInputValue(r.createdAt) === dateVal);
  }

  rows.sort((a, b) => {
    if (sortVal === "oldest") return ts(a.createdAt) - ts(b.createdAt);
    if (sortVal === "status") return a.status.localeCompare(b.status);
    if (sortVal === "block") {
      return a.block.localeCompare(b.block) || String(a.roomNumber).localeCompare(String(b.roomNumber));
    }
    return ts(b.createdAt) - ts(a.createdAt);
  });

  // Clamp the page after every filter change, then render one page.
  lastFilteredRows = Array.isArray(rows) ? rows : [];
  const totalPages = Math.max(1, Math.ceil(lastFilteredRows.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  renderComplaints(lastFilteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));
  renderPagination();
}

/** Render the "Showing X–Y of Z" label + Prev/Next pager under the table. */
function renderPagination() {
  let pager = document.getElementById("complaints-pager");
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "complaints-pager";
    pager.className = "pager";
    const responsive = complaintsBody?.closest(".table-responsive");
    if (responsive?.parentNode) responsive.parentNode.insertBefore(pager, responsive.nextSibling);
    else complaintsBody?.parentNode?.appendChild(pager);
  }
  const total = lastFilteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(total, currentPage * PAGE_SIZE);
  pager.innerHTML = "";

  const label = document.createElement("span");
  label.className = "pager__label";
  label.setAttribute("role", "status");
  label.textContent =
    total === 0 ? "No complaints to show." : `Showing ${start}–${end} of ${total}`;
  pager.appendChild(label);

  if (totalPages > 1) {
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "btn btn--ghost btn--sm";
    prev.textContent = "← Prev";
    prev.disabled = currentPage <= 1;
    prev.setAttribute("aria-label", "Previous complaints page");
    prev.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage -= 1;
        refreshComplaintsView();
      }
    });
    const next = document.createElement("button");
    next.type = "button";
    next.className = "btn btn--ghost btn--sm";
    next.textContent = "Next →";
    next.disabled = currentPage >= totalPages;
    next.setAttribute("aria-label", "Next complaints page");
    next.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage += 1;
        refreshComplaintsView();
      }
    });
    const page = document.createElement("span");
    page.className = "pager__page";
    page.textContent = `Page ${currentPage} of ${totalPages}`;
    pager.append(prev, page, next);
  }
}


/** Render the current page of complaint rows into the tracking table. */
function renderComplaints(rows) {
  const pageRows = Array.isArray(rows) ? rows : [];
  lastRenderedRows = pageRows;
  // Drop selections that are no longer in the filter so bulk can't hit stale rows.
  for (const id of Array.from(selectedIds)) {
    if (!lastFilteredRows.some((r) => r.id === id)) selectedIds.delete(id);
  }
  complaintsBody.innerHTML = "";

  if (rows.length === 0) {
    complaintsEmpty.classList.remove("hidden");
    updateBulkBar();
    return;
  }
  complaintsEmpty.classList.add("hidden");

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    if (isOverdue(r)) tr.classList.add("is-overdue");

    const selectTd = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedIds.has(r.id);
    checkbox.setAttribute("aria-label", `Select complaint ${r.shortId}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedIds.add(r.id);
      else selectedIds.delete(r.id);
      updateBulkBar();
    });
    selectTd.appendChild(checkbox);
    tr.appendChild(selectTd);

    const cells = [
      r.shortId,
      r.name,
      r.studentNumber,
      r.block,
      String(r.roomNumber),
      String(r.roomLetter),
      r.issues,
    ];
    cells.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });

    const statusTd = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = statusBadge(r.status);
    badge.textContent = r.status;
    statusTd.appendChild(badge);
    const prio = document.createElement("span");
    prio.className = `badge ${priorityBadge(r.priority)}`;
    prio.style.marginLeft = "6px";
    prio.textContent = normalizePriority(r.priority);
    statusTd.appendChild(prio);
    tr.appendChild(statusTd);

    const dateTd = document.createElement("td");
    dateTd.textContent = formatDate(r.createdAt);
    tr.appendChild(dateTd);

    const actionsTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--table-action";
    btn.textContent = "View";
    btn.addEventListener("click", () => openDetailModal(r.id));
    actionsTd.appendChild(btn);
    tr.appendChild(actionsTd);

    complaintsBody.appendChild(tr);
  });

  updateBulkBar();
}

/* ------------------------------ Bulk update ----------------------------- */

function updateBulkBar() {
  const bar = document.getElementById("bulk-bar");
  const count = document.getElementById("bulk-count");
  if (!bar || !count) return;
  count.textContent = `${selectedIds.size} selected`;
  bar.classList.toggle("hidden", selectedIds.size === 0);
  const selectAll = document.getElementById("select-all");
  if (selectAll) {
    const visibleIds = lastRenderedRows.map((r) => r.id);
    const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    selectAll.checked = allChecked;
    selectAll.indeterminate = !allChecked && visibleIds.some((id) => selectedIds.has(id));
  }
}

async function applyBulkUpdate() {
  if (selectedIds.size === 0) return;
  const status = document.getElementById("bulk-status")?.value || "";
  const priority = document.getElementById("bulk-priority")?.value || "";
  if (!status && !priority) {
    toast("Choose a status and/or priority to apply.", "error");
    return;
  }
  const ids = Array.from(selectedIds);
  const applyBtn = document.getElementById("bulk-apply");
  applyBtn.disabled = true;
  const original = applyBtn.textContent;
  applyBtn.textContent = "Applying…";
  let ok = 0;
  let failed = 0;
  // Sequential: kinder to the API; one summary toast instead of per-row noise.
  for (const id of ids) {
    try {
      if (status) {
        await api(`/complaints/${id}/status`, { method: "PATCH", body: { status } });
      }
      if (priority) {
        await api(`/complaints/${id}/priority`, { method: "PATCH", body: { priority } });
      }
      ok += 1;
    } catch (error) {
      console.error(`[management] bulk update failed for ${id}:`, error);
      failed += 1;
    }
  }
  applyBtn.disabled = false;
  applyBtn.textContent = original;
  selectedIds.clear();
  try {
    const overview = await api(`/admin/overview${includeArchived ? "?includeArchived=true" : ""}`, { auth: true });
    complaints = Array.isArray(overview.complaints) ? overview.complaints : [];
    renderStats();
    refreshComplaintsView();
    renderResidents();
  } catch (error) {
    console.error("[management] bulk refresh error:", error);
  }
  if (failed === 0) toast(`Updated ${ok} complaint${ok === 1 ? "" : "s"}.`, "success");
  else toast(`Updated ${ok}, failed ${failed}. Check permissions and try again.`, "error");
}

function initSlaControls() {
  document.querySelectorAll("[data-sla-filter]").forEach((el) => {
    el.addEventListener("click", async () => {
      switchTab("complaints");
      // Clear manual filters when jumping to a queue so the count matches.
      if (searchInput) searchInput.value = "";
      if (filterCategory) filterCategory.value = "";
      if (filterBlock) filterBlock.value = "";
      if (filterFloor) filterFloor.value = "";
      if (filterDate) filterDate.value = "";
      if (sortBy) sortBy.value = "newest";
      await setSlaFilter(el.dataset.slaFilter || "");
    });
  });
  const exportBtn = document.getElementById("export-csv-btn");
  if (exportBtn) exportBtn.addEventListener("click", exportFilteredCSV);
  const bulkStatus = document.getElementById("bulk-status");
  if (bulkStatus && bulkStatus.options.length <= 1) {
    COMPLAINT_STATUSES.forEach((status) => {
      const opt = document.createElement("option");
      opt.value = status;
      opt.textContent = status;
      bulkStatus.appendChild(opt);
    });
  }
  const selectAll = document.getElementById("select-all");
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      if (selectAll.checked) {
        lastRenderedRows.forEach((r) => selectedIds.add(r.id));
      } else {
        lastRenderedRows.forEach((r) => selectedIds.delete(r.id));
      }
      renderComplaints(lastRenderedRows);
    });
  }
  const applyBtn = document.getElementById("bulk-apply");
  if (applyBtn) applyBtn.addEventListener("click", applyBulkUpdate);
  const clearBtn = document.getElementById("bulk-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      selectedIds.clear();
      renderComplaints(lastRenderedRows);
    });
  }
}

/* ------------------------------ Residents tab ---------------------------- */

function renderResidents() {
  const term = (residentSearch?.value || "").trim().toLowerCase();
  let residents = Object.values(usersMap).filter((u) => u.role === "resident");

  if (term) {
    residents = residents.filter((u) => {
      const unit = u.unitId ? unitsMap[u.unitId] : null;
      return [u.name, u.studentNumber, u.email, unit?.block, unit?.roomNumber, unit?.roomLetter || unit?.unitName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }

  residents.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  residentsGrid.innerHTML = "";

  if (residents.length === 0) {
    residentsEmpty.textContent = term ? "No residents match your search." : "No residents have registered yet.";
    residentsEmpty.classList.remove("hidden");
    return;
  }
  residentsEmpty.classList.add("hidden");

  residents.forEach((resident) => {
    const unit = resident.unitId ? unitsMap[resident.unitId] : null;
    const roomId = unit?.roomId || resident.roomId;
    const room = roomId ? roomsMap[roomId] : null;
    const count = complaints.filter((c) => c.residentId === resident.uid).length;

    const card = document.createElement("div");
    card.className = "resident-card";

    const name = document.createElement("div");
    name.className = "resident-card__name";
    name.textContent = resident.name || "Unnamed";
    card.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "resident-card__meta";
    const block = unit?.block || room?.block || "—";
    const roomNumber = unit?.roomNumber ?? room?.roomNumber ?? "—";
    const letter = unit?.roomLetter || unit?.unitName || "—";
    meta.textContent = `${resident.studentNumber || "—"} · Block ${block} · Room ${roomNumber}${letter !== "—" ? ` (${letter})` : ""} · ${resident.email || ""}`;
    card.appendChild(meta);

    const badge = document.createElement("div");
    badge.className = "resident-card__complaints";
    badge.textContent = `${count} complaint${count === 1 ? "" : "s"}`;
    card.appendChild(badge);

    residentsGrid.appendChild(card);
  });
}

/* ------------------------------ Unit Profiles ---------------------------- */

/**
 * Build a map of roomId -> room profile. Each profile groups all of
 * its sub-units (room letters a/b/c) into a single card so management sees
 * one compact entry per room (e.g. "A 101") instead of one card per letter.
 */
function buildRoomProfiles() {
  const profiles = new Map();

  Object.keys(roomsMap).forEach((roomId) => {
    profiles.set(roomId, {
      roomId,
      room: roomsMap[roomId],
      units: getRoomBedSlots(unitsByRoom[roomId] || []),
      residents: [],
      complaints: [],
    });
  });

  // Assign residents to the room of their unit (by denormalized unitId or
  // by the unit that lists this resident as residentId).
  Object.values(usersMap)
    .filter((u) => u.role === "resident")
    .forEach((resident) => {
      let unit = resident.unitId ? unitsMap[resident.unitId] : null;
      if (!unit) {
        unit = Object.values(unitsMap).find((u) => u.residentId === resident.uid) || null;
      }
      const roomKey = unit?.roomId || resident.roomId || null;
      if (roomKey && profiles.has(roomKey)) {
        profiles.get(roomKey).residents.push(resident);
      }
    });

  // Assign complaints to the room of their unit (prefer complaint.unitId,
  // then the resident's unit, then the room's first unit, then complaint.roomId).
  complaints.forEach((c) => {
    let unit = c.unitId ? unitsMap[c.unitId] : null;
    if (!unit) {
      const resident = getResident(c.residentId);
      unit = (resident?.unitId && unitsMap[resident.unitId]) || null;
      if (!unit) unit = getUnitOf(c);
    }
    const roomKey = unit?.roomId || c.roomId || null;
    if (roomKey && profiles.has(roomKey)) {
      profiles.get(roomKey).complaints.push(c);
    }
  });

  // Drop rooms that have no units mapped.
  Array.from(profiles.keys()).forEach((k) => {
    if (profiles.get(k).units.length === 0) profiles.delete(k);
  });

  return profiles;
}

/* ------------------------------ Tab switching ----------------------------- */

function switchTab(name) {
  const tabs = {
    complaints: [tabComplaintsBtn, viewComplaints],
    residents: [tabResidentsBtn, viewResidents],
    units: [tabUnitsBtn, viewUnits],
  };
  Object.entries(tabs).forEach(([key, [btn, view]]) => {
    if (!btn || !view) return;
    btn.classList.toggle("is-active", key === name);
    view.classList.toggle("hidden", key !== name);
  });
}

/* --------------------------- Units tab: blocks --------------------------- */

function showBlockPicker() {
  selectedBlock = "";
  unitsBlockPicker.classList.remove("hidden");
  unitsBlockView.classList.add("hidden");
  unitsToolbar.classList.add("hidden");

  unitsBlockGrid.innerHTML = "";
  const blocks = ["A", "B", "C", "D", "E", "F"];

  blocks.forEach((block) => {
    const profiles = Array.from(buildRoomProfiles().values()).filter(
      (p) => (p.room?.block || (p.roomId || "")[0]) === block
    );
    const slots = profiles.flatMap((p) => p.units);
    const occupied = slots.filter((s) => s.occupied === true).length;
    const complaintCount = profiles.reduce((n, p) => n + p.complaints.length, 0);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "block-card";

    const name = document.createElement("div");
    name.className = "block-card__name";
    name.textContent = `Block ${block}`;
    card.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "block-card__meta";
    meta.textContent = `${profiles.length} room${profiles.length === 1 ? "" : "s"} · ${occupied} occupied · ${slots.length - occupied} available · ${complaintCount} complaint${complaintCount === 1 ? "" : "s"}`;
    card.appendChild(meta);

    const cta = document.createElement("div");
    cta.className = "block-card__cta";
    cta.textContent = "View units →";
    card.appendChild(cta);

    card.addEventListener("click", () => openBlock(block));
    unitsBlockGrid.appendChild(card);
  });
}

/** Show the room cards for one block (with search + status filters). */
function openBlock(block) {
  selectedBlock = block;
  unitsBlockPicker.classList.add("hidden");
  unitsBlockView.classList.remove("hidden");
  unitsToolbar.classList.remove("hidden");
  unitsBlockTitle.textContent = `Block ${block}`;
  refreshUnitsView();
}


/** Re-render room cards inside the selected block, applying filters. */
function refreshUnitsView() {
  if (!selectedBlock) return;
  unitsGrid.innerHTML = "";

  const term = (unitSearch?.value || "").trim().toLowerCase();
  const statusVal = unitStatus?.value || "";

  const profiles = Array.from(buildRoomProfiles().values())
    .filter((p) => (p.room?.block || (p.roomId || "")[0]) === selectedBlock)
    .filter((p) => {
      if (!term) return true;
      const residents = p.residents.map((r) => r.name || "").join(" ");
      const letters = getSubRooms(unitsByRoom[p.roomId] || []).map((s) => s.letter).join(" ");
      return [String(p.room?.roomNumber ?? p.roomId), p.room?.block, letters, residents]
        .join(" ")
        .toLowerCase()
        .includes(term);
    })
    .filter((p) => {
      if (!statusVal) return true;
      const slots = p.units;
      const occupied = slots.filter((s) => s.occupied === true);
      if (statusVal === "occupied") return occupied.length > 0;
      if (statusVal === "available") return occupied.length < slots.length;
      if (statusVal === "has-complaints") return p.complaints.length > 0;
      return true;
    })
    .sort((a, b) => (a.room?.roomNumber ?? 0) - (b.room?.roomNumber ?? 0));

  if (profiles.length === 0) {
    unitsEmpty.classList.remove("hidden");
    return;
  }
  unitsEmpty.classList.add("hidden");

  profiles.forEach((p) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "unit-card";

    const header = document.createElement("div");
    header.className = "unit-card__header";
    const title = document.createElement("span");
    title.className = "unit-card__title";
    title.textContent = `${p.room?.block || "?"} ${p.room?.roomNumber ?? p.roomId}`;
    header.appendChild(title);
    if (p.complaints.length > 0) {
      const badge = document.createElement("span");
      badge.className = "unit-card__badge";
      badge.textContent = `${p.complaints.length} open`;
      header.appendChild(badge);
    }
    card.appendChild(header);

    const letters = document.createElement("div");
    letters.className = "unit-card__letters";
    getSubRooms(unitsByRoom[p.roomId] || []).forEach(({ letter, slots }) => {
      const chip = document.createElement("span");
      const occupiedCount = slots.filter((s) => s.occupied === true).length;
      chip.className = "occupancy-chip " + (occupiedCount > 0 ? "is-occupied" : "is-available");
      chip.textContent = `Room ${letter}: ${occupiedCount}/${slots.length}`;
      letters.appendChild(chip);
    });
    card.appendChild(letters);

    const meta = document.createElement("div");
    meta.className = "unit-card__meta";
    meta.textContent = `${p.residents.length} resident${p.residents.length === 1 ? "" : "s"} · ${p.complaints.length} complaint${p.complaints.length === 1 ? "" : "s"}`;
    card.appendChild(meta);

    if (p.residents.length > 0) {
      const list = document.createElement("div");
      list.className = "unit-card__residents";
      p.residents.forEach((r) => {
        const row = document.createElement("div");
        row.className = "unit-card__resident";
        const nm = document.createElement("span");
        nm.className = "unit-card__resident-name";
        nm.textContent = r.name || "Unnamed";
        const rm = document.createElement("span");
        rm.className = "unit-card__resident-meta";
        const unit = r.unitId ? unitsMap[r.unitId] : null;
        rm.textContent = `${r.studentNumber || "—"} · Room ${unit?.roomLetter || unit?.unitName || "—"}`;
        row.appendChild(nm);
        row.appendChild(rm);
        list.appendChild(row);
      });
      card.appendChild(list);
    }

    card.addEventListener("click", () => openUnitModal(p.roomId));
    unitsGrid.appendChild(card);
  });
}


/* ---------------------------- Unit room modal ----------------------------- */

/** Load a room's announcements into the unit modal. */
async function loadUnitAnnouncements(roomId) {
  unitModalAnnouncements.innerHTML = "";
  try {
    const data = await api(`/announcements?roomId=${encodeURIComponent(roomId)}`);
    const items = Array.isArray(data.announcements) ? data.announcements : [];
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "notes-list__empty";
      empty.textContent = "No announcements for this room.";
      unitModalAnnouncements.appendChild(empty);
      return;
    }
    items.forEach((a) => {
      const item = document.createElement("div");
      item.className = "unit-announcement";
      const msg = document.createElement("div");
      msg.className = "note-item__text";
      msg.textContent = a.message || "";
      const meta = document.createElement("div");
      meta.className = "note-item__meta";
      meta.textContent = `${a.authorName || "Management"} · ${formatDate(a.createdAt)}`;
      item.appendChild(msg);
      item.appendChild(meta);
      unitModalAnnouncements.appendChild(item);
    });
  } catch (error) {
    console.error("[management] loadUnitAnnouncements error:", error);
    unitModalAnnouncements.innerHTML = '<div class="notes-list__empty">Could not load announcements.</div>';
  }
}

/** Open the modal for one parent room: summary, residents, complaints. */
function openUnitModal(roomId) {
  const profile = buildRoomProfiles().get(roomId);
  if (!profile) return;
  activeUnitRoomId = roomId;

  unitModalTitle.textContent = `${profile.room?.block || "?"} · Room ${profile.room?.roomNumber ?? roomId}`;

  const slots = profile.units;
  const occupied = slots.filter((s) => s.occupied === true).length;
  const activeCount = profile.complaints.filter(
    (c) => !["Completed", "Cancelled"].includes(normalizeStatus(c.status))
  ).length;

  unitModalSummary.innerHTML = "";
  const summaryItems = [
    ["Occupied Beds", `${occupied}/${slots.length}`],
    ["Residents", `${profile.residents.length}`],
    ["Total Complaints", `${profile.complaints.length}`],
    ["Active Complaints", `${activeCount}`],
  ];
  summaryItems.forEach(([labelText, value]) => {
    const div = document.createElement("div");
    div.className = "detail-grid__item";
    const l = document.createElement("div");
    l.className = "detail-grid__label";
    l.textContent = labelText;
    const v = document.createElement("div");
    v.className = "detail-grid__value";
    v.textContent = value;
    div.appendChild(l);
    div.appendChild(v);
    unitModalSummary.appendChild(div);
  });

  // Residents.
  unitModalResidents.innerHTML = "";
  if (profile.residents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "notes-list__empty";
    empty.textContent = "No residents assigned to this room.";
    unitModalResidents.appendChild(empty);
  } else {
    profile.residents.forEach((r) => {
      const row = document.createElement("div");
      row.className = "unit-resident";

      const info = document.createElement("div");
      const name = document.createElement("div");
      name.className = "unit-resident__name";
      name.textContent = r.name || "Unnamed";
      const unit = r.unitId ? unitsMap[r.unitId] : null;
      const meta = document.createElement("div");
      meta.className = "unit-resident__meta";
      meta.textContent = `${r.studentNumber || "—"} · Room ${unit?.roomLetter || unit?.unitName || "—"} · ${r.email || ""}`;
      info.appendChild(name);
      info.appendChild(meta);
      row.appendChild(info);

      const badge = document.createElement("span");
      badge.className = "badge badge--pending";
      const count = complaints.filter((c) => c.residentId === r.uid).length;
      badge.textContent = `${count} complaint(s)`;
      row.appendChild(badge);

      unitModalResidents.appendChild(row);
    });
  }


  // Complaints (grouped for this room, newest first).
  unitModalComplaints.innerHTML = "";
  const unitComplaints = profile.complaints
    .slice()
    .sort((a, b) => ts(b.createdAt) - ts(a.createdAt));

  if (unitComplaints.length === 0) {
    const empty = document.createElement("div");
    empty.className = "notes-list__empty";
    empty.textContent = "No complaints for this unit.";
    unitModalComplaints.appendChild(empty);
  } else {
    unitComplaints.forEach((c) => {
      const r = resolveComplaintRow(c);
      const item = document.createElement("div");
      item.className = "unit-complaint";

      const head = document.createElement("div");
      head.className = "unit-complaint__head";
      const title = document.createElement("span");
      title.className = "unit-complaint__title";
      title.textContent = `${r.category} · ${r.issues}`;
      const statusEl = document.createElement("span");
      const badge = document.createElement("span");
      badge.className = statusBadge(r.status);
      badge.textContent = r.status;
      statusEl.appendChild(badge);
      head.appendChild(title);
      head.appendChild(statusEl);
      item.appendChild(head);

      const meta = document.createElement("div");
      meta.className = "unit-complaint__meta";
      meta.appendChild(document.createTextNode(`By ${r.name} (${r.studentNumber})`));
      const dateSpan = document.createElement("span");
      dateSpan.textContent = formatDate(r.createdAt);
      meta.appendChild(dateSpan);
      item.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "unit-complaint__actions";
      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "btn btn--table-action";
      viewBtn.textContent = "Open";
      viewBtn.addEventListener("click", () => {
        closeUnitModal();
        openDetailModal(r.id);
      });
      actions.appendChild(viewBtn);
      item.appendChild(actions);

      unitModalComplaints.appendChild(item);
    });
  }

  unitModal.classList.remove("hidden");
  unitAnnouncementInput.value = "";
  loadUnitAnnouncements(roomId);
  a11yOpenModal(unitModal);
}

function closeUnitModal() {
  unitModal.classList.add("hidden");
  activeUnitRoomId = null;
  a11yCloseModal(unitModal);
}

/** POST a management announcement for the open room. */
async function handleUnitAnnouncement(event) {
  event.preventDefault();
  const message = unitAnnouncementInput.value.trim();
  if (!message || !activeUnitRoomId) return;

  unitAnnouncementSubmit.disabled = true;
  try {
    await api("/announcements", { method: "POST", body: { roomId: activeUnitRoomId, message } });
    unitAnnouncementInput.value = "";
    toast("Announcement posted.", "success");
    await loadUnitAnnouncements(activeUnitRoomId);
  } catch (error) {
    console.error("[management] announcement error:", error);
    toast(error.message || "Could not post announcement.", "error");
  } finally {
    unitAnnouncementSubmit.disabled = false;
  }
}


/* --------------------------- Complaint detail modal ----------------------- */

const modalTitle = $("#modal-title");

/** Populate the detail modal for one complaint (fresh fetch, no cache). */
async function openDetailModal(complaintId) {
  activeComplaintId = complaintId;
  try {
    const data = await api(`/complaints/${complaintId}`);
    const c = data.complaint || data;
    if (!c || !c.id) throw new Error("Complaint not found.");
    // Keep the cached copy in sync so table refreshes show the new state.
    const idx = complaints.findIndex((x) => x.id === complaintId);
    if (idx >= 0) complaints[idx] = c;
    renderDetailModal(c);
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    a11yOpenModal(modal);
  } catch (error) {
    console.error("[management] openDetailModal error:", error);
    toast(error.message || "Could not load the complaint.", "error");
  }
}

function renderDetailModal(c) {
  const r = resolveComplaintRow(c);

  const modalTitleEl = modalTitle || $("#modal-title");
  if (modalTitleEl) modalTitleEl.textContent = `Complaint ${r.shortId}`;

  modalStatusBadge.className = statusBadge(r.status);
  modalStatusBadge.textContent = r.status;

  modalDetails.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "detail-grid";
  const items = [
    ["Resident", `${r.name} (${r.studentNumber})`],
    ["Email", r.email || "—"],
    ["Location", `Block ${r.block} · Room ${r.roomNumber} (${r.roomLetter})`],
    ["Category", r.category],
    ["Issues", r.issues],
    ["Priority", normalizePriority(r.priority)],
    ["Submitted", formatDateTime(r.createdAt)],
    ["Last Updated", formatDateTime(r.updatedAt)],
    ["Estimated Completion", formatDate(r.estimatedCompletion)],
    ["Actual Completion", formatDate(r.actualCompletion)],
    ["Notes", r.notes || "—"],
  ];
  items.forEach(([labelText, value]) => {
    const div = document.createElement("div");
    div.className = "detail-grid__item";
    const l = document.createElement("div");
    l.className = "detail-grid__label";
    l.textContent = labelText;
    const v = document.createElement("div");
    v.className = "detail-grid__value";
    v.textContent = value;
    div.appendChild(l);
    div.appendChild(v);
    grid.appendChild(div);
  });
  modalDetails.appendChild(grid);

  // Selects reflect the current values.
  modalStatusSelect.value = r.status;
  modalPrioritySelect.value = normalizePriority(r.priority);
  modalEstimated.value = toDateInputValue(c.estimatedCompletion);
  modalActual.value = toDateInputValue(c.actualCompletion);

  // Photos.
  modalPhotos.innerHTML = "";
  if (r.photoURLs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "photo-empty";
    empty.textContent = "No photos attached.";
    modalPhotos.appendChild(empty);
  } else {
    const gallery = document.createElement("div");
    gallery.className = "photo-gallery";
    r.photoURLs.forEach((url) => {
      const img = document.createElement("img");
      img.className = "photo-gallery__item";
      img.src = resolvePhotoURL(url);
      img.alt = "Complaint photo";
      img.loading = "lazy";
      gallery.appendChild(img);
    });
    modalPhotos.appendChild(gallery);
  }

  // Reopen review section (only when a reopen was requested).
  const requested = c.reopenRequested === true;
  document.querySelectorAll("#reopen-review-section").forEach((el) => {
    el.classList.toggle("hidden", !requested);
  });
  if (requested && reopenReview) {
    reopenReview.innerHTML = "";
    const msg = document.createElement("p");
    msg.textContent = `Resident requested a reopen${c.reopenReason ? `: "${c.reopenReason}"` : "."}`;
    reopenReview.appendChild(msg);
    const actions = document.createElement("div");
    actions.className = "reopen-review__actions";
    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "btn";
    approve.textContent = "Approve Reopen";
    approve.addEventListener("click", () => decideReopen(c.id, true));
    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "btn btn--danger";
    reject.textContent = "Reject";
    reject.addEventListener("click", () => decideReopen(c.id, false));
    actions.appendChild(approve);
    actions.appendChild(reject);
    reopenReview.appendChild(actions);
  }

  // Timeline + notes (server-backed; timeline events are written by the API).
  loadTimeline(c.id)
    .then((events) => renderTimeline(modalTimeline, events))
    .catch((error) => {
      console.error("[management] timeline error:", error);
      renderTimeline(modalTimeline, []);
    });
  loadNotes(c.id);
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  activeComplaintId = null;
  a11yCloseModal(modal);
}

/** Approve / reject a reopen request. */
async function decideReopen(complaintId, approve) {
  try {
    await api(`/complaints/${complaintId}/reopen-decision`, {
      method: "POST",
      body: { approve },
    });
    toast(approve ? "Reopen approved." : "Reopen rejected.", "success");
    await refreshAfterMutation(complaintId);
  } catch (error) {
    console.error("[management] reopen decision error:", error);
    toast(error.message || "Could not update the reopen request.", "error");
  }
}

/** Shared post-mutation flow: refresh table + reopen the modal. */
async function refreshAfterMutation(complaintId) {
  const overview = await api("/admin/overview", { auth: true });
  complaints = Array.isArray(overview.complaints) ? overview.complaints : [];
  // Prune bulk selections for complaints that no longer exist.
  for (const id of Array.from(selectedIds)) {
    if (!complaints.some((c) => c.id === id)) selectedIds.delete(id);
  }
  renderStats();
  refreshComplaintsView();
  renderResidents();
  if (complaintId) await openDetailModal(complaintId);
}


/* -------------------- Status / priority / dates handlers ------------------- */

async function handleStatusChange() {
  if (!activeComplaintId) return;
  const status = modalStatusSelect.value;
  const c = complaints.find((x) => x.id === activeComplaintId);
  if (c && normalizeStatus(c.status) === status) return;

  modalStatusSelect.disabled = true;
  try {
    await api(`/complaints/${activeComplaintId}/status`, {
      method: "PATCH",
      body: { status },
    });
    toast("Status updated.", "success");
    await refreshAfterMutation(activeComplaintId);
  } catch (error) {
    console.error("[management] status update error:", error);
    toast(error.message || "Could not update the status. Please try again.", "error");
    modalStatusSelect.disabled = false;
  }
}

async function handlePriorityChange() {
  if (!activeComplaintId) return;
  const priority = modalPrioritySelect.value;
  const c = complaints.find((x) => x.id === activeComplaintId);
  if (c && normalizePriority(c.priority) === priority) return;

  modalPrioritySelect.disabled = true;
  try {
    await api(`/complaints/${activeComplaintId}/priority`, {
      method: "PATCH",
      body: { priority },
    });
    toast("Priority updated.", "success");
    await refreshAfterMutation(activeComplaintId);
  } catch (error) {
    console.error("[management] priority update error:", error);
    toast(error.message || "Could not update the priority. Please try again.", "error");
    modalPrioritySelect.disabled = false;
  }
}

async function handleDatesChange() {
  if (!activeComplaintId) return;
  const c = complaints.find((x) => x.id === activeComplaintId);
  if (!c) return;

  const estimate = modalEstimated.value; // YYYY-MM-DD or ""
  const actual = modalActual.value;

  // Only write if something changed.
  if (
    estimate === toDateInputValue(c.estimatedCompletion) &&
    actual === toDateInputValue(c.actualCompletion)
  ) {
    return;
  }

  modalEstimated.disabled = true;
  modalActual.disabled = true;
  try {
    await api(`/complaints/${activeComplaintId}/dates`, {
      method: "PATCH",
      body: {
        estimatedCompletion: estimate || null,
        actualCompletion: actual || null,
      },
    });
    toast("Completion dates updated.", "success");
    await refreshAfterMutation(activeComplaintId);
  } catch (error) {
    console.error("[management] dates update error:", error);
    toast(error.message || "Could not update completion dates. Please try again.", "error");
    modalEstimated.disabled = false;
    modalActual.disabled = false;
  }
}

/* ------------------------------ Notes ------------------------------------ */

async function loadNotes(complaintId) {
  notesList.innerHTML = '<div class="notes-list__empty">No maintenance notes yet.</div>';
  try {
    const data = await api(`/complaints/${complaintId}/notes`);
    const notes = Array.isArray(data.notes) ? data.notes : [];
    if (notes.length === 0) return;

    notesList.innerHTML = "";
    notes.forEach((note) => {
      const item = document.createElement("div");
      item.className = "note-item";

      const text = document.createElement("div");
      text.className = "note-item__text";
      text.textContent = note.text || "";

      const meta = document.createElement("div");
      meta.className = "note-item__meta";
      meta.textContent = `${note.authorName || "Management"} · ${formatDate(note.createdAt)}`;

      item.appendChild(text);
      item.appendChild(meta);
      notesList.appendChild(item);
    });
  } catch (error) {
    console.error("[management] loadNotes error:", error);
    notesList.innerHTML = '<div class="notes-list__empty">Could not load notes.</div>';
  }
}

async function handleAddNote(event) {
  event.preventDefault();
  const text = noteInput.value.trim();
  if (!text || !activeComplaintId) return;

  noteSubmit.disabled = true;
  try {
    await api(`/complaints/${activeComplaintId}/notes`, {
      method: "POST",
      body: { text },
    });
    noteInput.value = "";
    toast("Note added.", "success");
    await loadNotes(activeComplaintId);
  } catch (error) {
    console.error("[management] addNote error:", error);
    toast(error.message || "Could not add the note. Please try again.", "error");
  } finally {
    noteSubmit.disabled = false;
  }
}


/* ----------------------------- Event wiring ------------------------------ */

tabComplaintsBtn.addEventListener("click", () => switchTab("complaints"));
tabResidentsBtn.addEventListener("click", () => switchTab("residents"));
tabUnitsBtn.addEventListener("click", () => {
  switchTab("units");
  if (!selectedBlock) showBlockPicker();
});

searchInput.addEventListener("input", () => { currentPage = 1; refreshComplaintsView(); });
filterStatus.addEventListener("change", () => { currentPage = 1; refreshComplaintsView(); });
filterCategory.addEventListener("change", () => { currentPage = 1; refreshComplaintsView(); });
filterBlock.addEventListener("change", () => { currentPage = 1; refreshComplaintsView(); });
filterFloor.addEventListener("change", () => { currentPage = 1; refreshComplaintsView(); });
filterDate.addEventListener("change", () => { currentPage = 1; refreshComplaintsView(); });
sortBy.addEventListener("change", () => { currentPage = 1; refreshComplaintsView(); });

residentSearch.addEventListener("input", renderResidents);

unitSearch.addEventListener("input", refreshUnitsView);
unitStatus.addEventListener("change", refreshUnitsView);
unitsBack.addEventListener("click", showBlockPicker);

document.querySelectorAll("[data-close-unit-modal]").forEach((el) => {
  el.addEventListener("click", closeUnitModal);
});
unitAnnouncementForm.addEventListener("submit", handleUnitAnnouncement);

modalStatusSelect.addEventListener("change", handleStatusChange);
modalPrioritySelect.addEventListener("change", handlePriorityChange);
modalEstimated.addEventListener("change", handleDatesChange);
modalActual.addEventListener("change", handleDatesChange);
noteForm.addEventListener("submit", handleAddNote);

document.querySelectorAll("[data-close-modal]").forEach((el) => {
  el.addEventListener("click", closeModal);
});
// Escape handling comes from js/modal.js, which only acts on the
// topmost open dialog (so nested dialogs unwind one layer at a time).
modal.addEventListener("modal:escape", closeModal);
unitModal.addEventListener("modal:escape", closeUnitModal);

/* --------------------------------- Init ---------------------------------- */

async function init() {
  const profile = await requireRole(["management"]);
  if (!profile) return;
  currentProfile = profile;

  // Session verified — drop the auth gate so the dashboard (hidden by
  // css/management.css until now) becomes visible.
  document.body.classList.remove("auth-guarding");

  renderNav(profile);
  warnIfSessionExpiring({ toast });

  // Populate the status filter once.
  filterStatus.innerHTML = '<option value="">All statuses</option>';
  COMPLAINT_STATUSES.forEach((status) => {
    const opt = document.createElement("option");
    opt.value = status;
    opt.textContent = status;
    filterStatus.appendChild(opt);
  });

  // The modal status select has no options in the markup — fill it from the
  // shared list so the current status renders as a real dropdown.
  modalStatusSelect.innerHTML = "";
  COMPLAINT_STATUSES.forEach((status) => {
    const opt = document.createElement("option");
    opt.value = status;
    opt.textContent = status;
    modalStatusSelect.appendChild(opt);
  });

  // The category filter and priority select options are already present in
  // the HTML markup (management.html). Populating them again here would
  // create duplicate <option> elements, so we leave them untouched.

  initSlaControls();
  switchTab("complaints");
  // Default queue = Open (not All): Completed/Cancelled + archived rows stay
  // out of the way until management asks for them. Set before the first load
  // so the chip highlights and the count matches.
  slaFilter = "open";
  document.querySelectorAll("[data-sla-filter]").forEach((el) => {
    el.classList.toggle("is-active", (el.dataset.slaFilter || "") === "open");
  });

  try {
    await loadAllData();
    const releasedCount = await releaseOrphanedUnits();
    if (releasedCount > 0) {
      toast(
        `${releasedCount} bed${releasedCount === 1 ? "" : "s"} released because the resident profile was deleted.`,
        "success"
      );
    }
    renderStats();
    refreshComplaintsView();
    renderResidents();
    showBlockPicker();
  } catch (error) {
    console.error("[management] init error:", error);
    complaintsLoading.classList.add("hidden");
    complaintsEmpty.textContent = error.message || "Could not load dashboard data. Please try again.";
    complaintsEmpty.classList.remove("hidden");
  }
}

init().catch((error) => {
  // requireRole() never rejects (it redirects instead), so anything landing
  // here escaped from further down. Never leave the call floating — an
  // unhandled rejection used to strand the page with a spinner that never
  // stopped — and never lift the auth gate without a verified profile.
  console.error("[management] init error:", error);
  if (!currentProfile) {
    // The session was never confirmed (storage blocked, script fault):
    // leave for login instead of exposing the dashboard.
    window.location.href = "login.html?reason=unavailable";
    return;
  }
  document.body.classList.remove("auth-guarding");
  if (complaintsLoading) complaintsLoading.classList.add("hidden");
  toast(error.message || "The dashboard could not be loaded. Please refresh.", "error", 8000);
});

