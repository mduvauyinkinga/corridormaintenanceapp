/**
 * tracking.js
 * ------------------------------------------------------------------
 * Resident complaint tracking (self-coded backend version).
 *
 * Loads the signed-in resident's complaints AND the reports filed by
 * their unit mates (same room, same lettered unit) with their current
 * status, category, priority badge, room/unit, reporter, and a details
 * modal that shows the timeline, photos, completion dates, maintenance
 * notes, and a reopen request control.
 *
 * Only the resident who filed a report may edit, cancel or reopen it —
 * a unit mate's row is read-only here (and the server refuses those
 * writes too), so nobody can change somebody else's complaint.
 *
 * Data comes from the Express API:
 *   GET    /api/complaints?residentId=&scope=unit -> own + unit mates'
 *   GET    /api/rooms/:id, /api/units/:id -> display labels (cached)
 *   GET    /api/complaints/:id/timeline  -> server-written events
 *   GET    /api/complaints/:id/notes     -> management notes
 *   PATCH  /api/complaints/:id           -> edit (Submitted/Received)
 *   POST   /api/complaints/:id/cancel    -> cancel
 *   POST   /api/complaints/:id/reopen    -> request reopen
 */

import { api, resolvePhotoURL } from "./api.js";
import { requireRole, warnIfSessionExpiring } from "./auth.js";
import { renderNav } from "./nav.js";
import { loadTimeline, renderTimeline } from "./timeline.js";
import { closeModal as a11yCloseModal, openModal as a11yOpenModal } from "./modal.js";
import { setButtonLoading } from "./utils.js";
import {
  formatDate,
  formatDateTime,
  statusBadge,
  normalizeStatus,
  normalizePriority,
  priorityBadge,
  isOverdue,
  COMPLAINT_STATUSES,
  PRIORITIES,
  issuesForCategory,
  renderStepper,
  toast,
  $,
} from "./utils.js";

const tbody = $("#tracking-body");
const loadingEl = $("#tracking-loading");
const emptyEl = $("#tracking-empty");

// Filter controls (mirroring the management dashboard).
const searchInput = $("#search-input");
const filterStatus = $("#filter-status");
const filterCategory = $("#filter-category");
const sortBy = $("#sort-by");
const countEl = $("#tracking-count");

const modal = $("#complaint-modal");
const modalDetails = $("#modal-details");
const modalStepper = $("#modal-stepper");
const modalPhotos = $("#modal-photos");
const modalTimeline = $("#modal-timeline");
const modalNotes = $("#modal-notes");
const reopenBtn = $("#reopen-btn");
const reopenMsg = $("#reopen-msg");

// Edit modal refs
const editModal = $("#edit-modal");
const editForm = $("#edit-form");
const editCategory = $("#edit-category");
const editIssuesBox = $("#edit-issues-list");
const editNotes = $("#edit-notes");
const editSaveBtn = $("#edit-save-btn");
const editAlert = $("#edit-alert");

let editingComplaintId = null;

// The complaint currently open in the modal (from this page's data).
let activeComplaint = null;

// Signed-in resident profile (from requireRole in init).
let currentProfile = null;

/** True when this report was filed by the signed-in resident. */
function isMine(complaint) {
  return Boolean(complaint) && complaint.residentId === currentProfile?.uid;
}

/** "You" for your own report, otherwise the unit mate who filed it. */
function reporterLabel(complaint) {
  if (isMine(complaint)) return "You";
  return complaint?.residentName || "Unit mate";
}

// Cache resolved room/unit display labels across complaints. A resident
// has only one room and one unit, so this avoids duplicate API reads.
const resolveCache = { room: {}, unit: {} };

/**
 * Resolve a room's display number and a unit letter from the backend.
 * Falls back to the raw ID if the lookup fails. Results are cached per
 * page load to avoid duplicate requests.
 */
async function resolveRoomAndUnit(roomId, unitId) {
  let roomLabel = roomId || "—";
  let unitLabel = unitId || "—";

  try {
    if (roomId && !resolveCache.room[roomId]) {
      const data = await api(`/rooms/${encodeURIComponent(roomId)}`);
      resolveCache.room[roomId] = data.room?.roomNumber ?? roomId;
    }
    if (roomId) roomLabel = resolveCache.room[roomId];

    if (unitId && !resolveCache.unit[unitId]) {
      const data = await api(`/units/${encodeURIComponent(unitId)}`);
      resolveCache.unit[unitId] = data.unit?.unitName ?? unitId;
    }
    if (unitId) unitLabel = resolveCache.unit[unitId];
  } catch (error) {
    console.warn("[tracking] Could not resolve room/unit:", error);
  }

  return { roomLabel, unitLabel };
}

/* ------------------------------ Detail modal ------------------------------ */

function formatDateValue(value) {
  if (!value) return "—";
  return formatDate(value);
}

function openComplaintModal(complaint, roomLabel, unitLabel) {
  activeComplaint = complaint;

  // Details grid.
  modalDetails.innerHTML = "";
  const overdue = isOverdue(complaint);
  const priority = normalizePriority(complaint.priority);

  // Priority badge element.
  const priorityWrap = document.createElement("div");
  priorityWrap.className = "priority-wrap";
  const priorityBadgeEl = document.createElement("span");
  priorityBadgeEl.className = priorityBadge(priority);
  priorityBadgeEl.textContent = priority;
  priorityWrap.appendChild(priorityBadgeEl);
  if (overdue) {
    const ov = document.createElement("span");
    ov.className = "badge badge--overdue";
    ov.textContent = "Overdue";
    priorityWrap.appendChild(ov);
  }

  const items = [
    ["Issues", Array.isArray(complaint.issues) ? complaint.issues.join(", ") : String(complaint.issues || "—")],
    ["Category", complaint.category || "—"],
    ["Priority", priorityWrap],
    ["Room", roomLabel],
    ["Unit", unitLabel],
    ["Reported by", reporterLabel(complaint)],
    ["Current Status", normalizeStatus(complaint.status)],
    ["Date Submitted", formatDateValue(complaint.createdAt)],
    ["Estimated Completion", formatDateValue(complaint.estimatedCompletion)],
    ["Actual Completion", formatDateValue(complaint.actualCompletion)],
    ["Notes", complaint.notes || "—"],
  ];

  items.forEach(([label, value]) => {
    const div = document.createElement("div");
    div.className = "detail-grid__item";
    const l = document.createElement("div");
    l.className = "detail-grid__label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "detail-grid__value";
    if (value instanceof Node) {
      v.appendChild(value);
    } else {
      v.textContent = value || "—";
    }
    div.appendChild(l);
    div.appendChild(v);
    modalDetails.appendChild(div);
  });

  // Photos.
  renderPhotos(complaint.photoURLs);

  // Progress stepper — visual workflow above the raw timeline.
  if (modalStepper) {
    modalStepper.innerHTML = "";
    modalStepper.appendChild(renderStepper(complaint.status));
  }

  // Timeline (server-written events).
  modalTimeline.innerHTML = '<div class="timeline__empty">Loading timeline…</div>';
  loadTimeline(complaint.id)
    .then((events) => renderTimeline(modalTimeline, events))
    .catch((error) => {
      console.error("[tracking] loadTimeline error:", error);
      modalTimeline.innerHTML = '<div class="timeline__empty">Could not load timeline.</div>';
    });

  // Notes.
  loadNotes(complaint.id).then((notes) => {
    modalNotes.innerHTML = "";
    if (notes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "notes-list__empty";
      empty.textContent = "No maintenance notes yet.";
      modalNotes.appendChild(empty);
      return;
    }
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
      modalNotes.appendChild(item);
    });
  });

  // Reopen control — only the resident who filed the report may ask for
  // a reopen; a unit mate can watch the progress but not act on it.
  const status = normalizeStatus(complaint.status);
  if (!isMine(complaint)) {
    reopenBtn.classList.add("hidden");
    reopenMsg.textContent =
      "Only the resident who reported this can request a reopen.";
  } else if (status === "Completed") {
    if (complaint.reopenRequested) {
      reopenBtn.classList.add("hidden");
      reopenMsg.textContent =
        complaint.reopenStatus === "Approved"
          ? "Your reopen request was approved. The complaint is now In Progress."
          : complaint.reopenStatus === "Rejected"
          ? "Your reopen request was rejected. The complaint remains completed."
          : "Your reopen request is waiting for management review.";
    } else {
      reopenBtn.classList.remove("hidden");
      reopenMsg.textContent =
        "If you believe this complaint was not fully resolved, you can request to reopen it.";
    }
  } else if (status === "In Progress" && complaint.reopenRequested) {
    reopenBtn.classList.add("hidden");
    reopenMsg.textContent = "This complaint was reopened and is In Progress.";
  } else {
    reopenBtn.classList.add("hidden");
    reopenMsg.textContent = "A complaint can be reopened once it has been completed.";
  }

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  // Move focus in and trap Tab inside the dialog.
  a11yOpenModal(modal);
}


function renderPhotos(urls) {
  modalPhotos.innerHTML = "";
  if (!Array.isArray(urls) || urls.length === 0) {
    const empty = document.createElement("div");
    empty.className = "photo-emptyr";
    empty.textContent = "No photos attached.";
    modalPhotos.appendChild(empty);
    return;
  }
  urls.forEach((url) => {
    const src = resolvePhotoURL(url);
    const link = document.createElement("a");
    link.href = src;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "photo-gallery__item";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "Complaint photo";
    img.loading = "lazy";
    link.appendChild(img);
    modalPhotos.appendChild(link);
  });
}

/** Load management notes for one complaint (oldest first). */
async function loadNotes(complaintId) {
  const data = await api(`/complaints/${encodeURIComponent(complaintId)}/notes`);
  return Array.isArray(data.notes) ? data.notes : [];
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  activeComplaint = null;
  // Return focus to whatever opened the dialog.
  a11yCloseModal(modal);
}

/* ------------------------------ Reopen logic ------------------------------ */

async function handleReopen() {
  if (!activeComplaint) return;
  reopenBtn.disabled = true;
  try {
    const data = await api(`/complaints/${activeComplaint.id}/reopen`, {
      method: "POST",
    });
    if (data?.complaint) Object.assign(activeComplaint, data.complaint);
    else {
      activeComplaint.reopenRequested = true;
      activeComplaint.reopenStatus = "Pending";
    }
    toast("Reopen request submitted for management review.", "success");
    closeModal();
  } catch (error) {
    console.error("[tracking] reopen error:", error);
    toast(error.message || "Could not submit the reopen request. Please try again.", "error");
    reopenBtn.disabled = false;
  }
}


/* ------------------------------ Edit logic -------------------------------- */

function renderEditIssues(category, selected = []) {
  editIssuesBox.innerHTML = "";
  const keep = new Set(selected);
  issuesForCategory(category).forEach((issue) => {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.name = "editIssues";
    box.value = issue;
    if (keep.has(issue)) box.checked = true;
    const text = document.createElement("span");
    text.textContent = issue;
    label.append(box, text);
    editIssuesBox.appendChild(label);
  });
}

function openEditModal(complaint) {
  editingComplaintId = complaint.id;
  editCategory.value = complaint.category || "";
  editNotes.value = complaint.notes || "";

  // Render the relevant checklist for the complaint's category,
  // preserving issues that are no longer in the list.
  const selected = Array.isArray(complaint.issues) ? complaint.issues : [];
  renderEditIssues(editCategory.value || complaint.category, selected);
  // Keep issues that exist on the complaint but not in the current
  // category list (e.g. legacy data) so nothing is silently dropped.
  const known = new Set(
    Array.from(editIssuesBox.querySelectorAll('input[type="checkbox"]')).map((cb) => cb.value)
  );
  selected.filter((v) => !known.has(v)).forEach((extra) => {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.name = "editIssues";
    box.value = extra;
    box.checked = true;
    const text = document.createElement("span");
    text.textContent = extra;
    label.append(box, text);
    editIssuesBox.appendChild(label);
  });

  if (editAlert) editAlert.hidden = true;
  editModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  a11yOpenModal(editModal);
}

async function handleEditSubmit(event) {
  event.preventDefault();
  if (!editingComplaintId) return;

  const category = editCategory.value;
  const issues = Array.from(
    editIssuesBox.querySelectorAll('input[type="checkbox"]:checked')
  ).map((cb) => cb.value);

  // Clear previous errors.
  const catErr = document.querySelector('[data-error="editCategory"]');
  const issErr = document.querySelector('[data-error="editIssues"]');
  if (catErr) catErr.textContent = "";
  if (issErr) issErr.textContent = "";

  if (!category) {
    if (catErr) catErr.textContent = "Please select a category.";
    return;
  }
  if (issues.length === 0) {
    if (issErr) issErr.textContent = "Please select at least one issue.";
    return;
  }

  const notes = editNotes.value.trim();
  const restore = setButtonLoading(editSaveBtn, "Saving…");

  try {
    // The server updates the complaint AND writes the "Complaint Edited"
    // timeline event atomically.
    await api(`/complaints/${editingComplaintId}`, {
      method: "PATCH",
      body: { category, issues, notes },
    });

    toast("Complaint updated successfully!", "success");
    closeEditModal();
    // Reload the tracking table to reflect changes.
    loadingEl.classList.remove("hidden");
    tbody.innerHTML = "";
    emptyEl.classList.add("hidden");
    await loadComplaints();
  } catch (error) {
    console.error("[tracking] edit error:", error);
    if (editAlert) {
      editAlert.textContent = error.message || "Could not update the complaint.";
      editAlert.hidden = false;
    }
  } finally {
    restore();
  }
}

function closeEditModal() {
  editModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  editingComplaintId = null;
  a11yCloseModal(editModal);
}


/* ------------------------------ Cancel logic ------------------------------ */

async function handleCancel(complaint) {
  const status = normalizeStatus(complaint.status);
  if (status !== "Submitted" && status !== "Received") {
    toast("This complaint can no longer be cancelled.", "error");
    return;
  }

  const confirmed = window.confirm(
    "Are you sure you want to cancel this complaint? This cannot be undone."
  );
  if (!confirmed) return;

  try {
    // The server cancels AND writes the "Complaint Cancelled" timeline
    // event atomically.
    await api(`/complaints/${complaint.id}/cancel`, { method: "POST" });

    toast("Complaint cancelled.", "info");
    loadingEl.classList.remove("hidden");
    tbody.innerHTML = "";
    emptyEl.classList.add("hidden");
    await loadComplaints();
  } catch (error) {
    console.error("[tracking] cancel error:", error);
    toast(error.message || "Could not cancel the complaint. Please try again.", "error");
  }
}

/* ------------------------------ Table loading ------------------------------ */

// The resident's complaints for this page load, newest first. Filtering and
// sorting happen in memory against this array, so changing a filter never
// costs another round-trip.
let allComplaints = [];

// Resolved { roomLabel, unitLabel } per complaint id.
let labelsByComplaint = {};

/**
 * Filter + sort complaints for display.
 *
 * Pure: it takes its inputs and touches no DOM, so it can be reasoned
 * about (and tested) in isolation. `renderComplaints` supplies the live
 * control values and writes the result to the table.
 *
 * @param {object[]} complaints - every complaint the resident has.
 * @param {{search?: string, status?: string, category?: string, sort?: string}} filters
 * @returns {object[]} the rows to render, in display order.
 */
export function selectVisibleComplaints(complaints, filters = {}) {
  const term = (filters.search || "").trim().toLowerCase();
  const statusFilter = filters.status || "";
  const categoryFilter = filters.category || "";
  const sort = filters.sort || "newest";

  let rows = (Array.isArray(complaints) ? complaints : []).slice();

  if (statusFilter) {
    rows = rows.filter((c) => normalizeStatus(c.status) === statusFilter);
  }

  if (categoryFilter) {
    rows = rows.filter((c) => c.category === categoryFilter);
  }

  // Free-text search across the fields a resident would recognise.
  if (term) {
    rows = rows.filter((c) => {
      const issues = Array.isArray(c.issues) ? c.issues.join(" ") : String(c.issues || "");
      // Unit mates' reports are searchable too (only when a reporter name
      // exists, so plain own-report searches behave exactly as before).
      const reporter = c.residentName ? ` ${c.residentName}` : "";
      const haystack = `${c.category || ""} ${issues} ${c.notes || ""}${reporter}`.toLowerCase();
      return haystack.includes(term);
    });
  }

  // Sorting. Callers pass newest-first, so "newest" is the natural order
  // and the others are explicit re-sorts.
  const createdMs = (c) => new Date(c.createdAt || 0).getTime() || 0;
  if (sort === "oldest") {
    rows.sort((a, b) => createdMs(a) - createdMs(b));
  } else if (sort === "status") {
    rows.sort(
      (a, b) =>
        COMPLAINT_STATUSES.indexOf(normalizeStatus(a.status)) -
          COMPLAINT_STATUSES.indexOf(normalizeStatus(b.status)) ||
        createdMs(b) - createdMs(a)
    );
  } else if (sort === "priority") {
    rows.sort(
      (a, b) =>
        PRIORITIES.indexOf(normalizePriority(b.priority)) -
        PRIORITIES.indexOf(normalizePriority(a.priority))
    );
  } else {
    rows.sort((a, b) => createdMs(b) - createdMs(a));
  }

  return rows;
}

/**
 * Populate the status / category <select>s from the data actually present,
 * so a resident only ever sees options that would return something.
 */
function populateFilterOptions(complaints) {
  if (filterStatus) {
    const statuses = [...new Set(complaints.map((c) => normalizeStatus(c.status)))];
    filterStatus.innerHTML = '<option value="">All statuses</option>';
    statuses.forEach((status) => {
      const opt = document.createElement("option");
      opt.value = status;
      opt.textContent = status;
      filterStatus.appendChild(opt);
    });
  }
  if (filterCategory) {
    const categories = [...new Set(complaints.map((c) => c.category).filter(Boolean))].sort();
    filterCategory.innerHTML = '<option value="">All categories</option>';
    categories.forEach((category) => {
      const opt = document.createElement("option");
      opt.value = category;
      opt.textContent = category;
      filterCategory.appendChild(opt);
    });
  }
}

/**
 * Build a <td> carrying a data-label.
 *
 * On narrow screens the table becomes a stack of cards (see
 * css/management.css), and each cell draws its column name from
 * data-label via a ::before pseudo-element — otherwise the header row is
 * hidden and the values have no context.
 */
function makeCell(label) {
  const td = document.createElement("td");
  td.dataset.label = label;
  return td;
}

/**
 * Build one table row for a complaint.
 * @param {object} data2 - the complaint.
 * @param {string} roomLabel - display label for its room.
 * @param {string} unitLabel - display label for its unit.
 */
function buildComplaintRow(data2, roomLabel, unitLabel) {
  const tr = document.createElement("tr");
  if (isOverdue(data2)) tr.className = "is-overdue";

  const issueCell = makeCell("Issue");
  issueCell.textContent = Array.isArray(data2.issues) ? data2.issues.join(", ") : String(data2.issues || "—");

  const catCell = makeCell("Category");
  catCell.textContent = data2.category || "—";

  const priorityCell = makeCell("Priority");
  const priority = normalizePriority(data2.priority);
  const priorityBadgeEl = document.createElement("span");
  priorityBadgeEl.className = priorityBadge(priority);
  priorityBadgeEl.textContent = priority;
  priorityCell.appendChild(priorityBadgeEl);

  const roomCell = makeCell("Room");
  roomCell.textContent = roomLabel;

  const unitCell = makeCell("Unit");
  unitCell.textContent = unitLabel;

  const reporterCell = makeCell("Reported by");
  reporterCell.textContent = reporterLabel(data2);

  const dateCell = makeCell("Date");
  dateCell.textContent = formatDate(data2.createdAt);

  const statusCell = makeCell("Status");
  const badge = document.createElement("span");
  badge.className = statusBadge(data2.status);
  badge.textContent = normalizeStatus(data2.status) || "Submitted";
  statusCell.appendChild(badge);

  const actionsCell = makeCell("Actions");
  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.className = "btn btn--ghost btn--sm";
  viewBtn.textContent = "View";
  viewBtn.setAttribute(
    "aria-label",
    `View complaint ${data2.id.slice(0, 8).toUpperCase()}`
  );
  viewBtn.addEventListener("click", () =>
    openComplaintModal(data2, roomLabel, unitLabel)
  );
  actionsCell.appendChild(viewBtn);

  // Manage: Edit + Cancel — only while the complaint is still editable
  // AND filed by this resident (a unit mate's report is read-only here;
  // the server refuses those writes as well).
  const manageCell = makeCell("Manage");
  const status2 = normalizeStatus(data2.status);
  const editable =
    isMine(data2) && (status2 === "Submitted" || status2 === "Received");

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn--primary btn--sm btn--table-action";
  editBtn.textContent = "Edit";
  editBtn.disabled = !editable;
  editBtn.setAttribute("aria-label", `Edit complaint ${data2.id.slice(0, 8).toUpperCase()}`);
  editBtn.addEventListener("click", () => openEditModal(data2));
  manageCell.appendChild(editBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn--ghost btn--sm btn--danger btn--table-action";
  cancelBtn.textContent = "Cancel";
  cancelBtn.disabled = !editable;
  cancelBtn.setAttribute("aria-label", `Cancel complaint ${data2.id.slice(0, 8).toUpperCase()}`);
  cancelBtn.addEventListener("click", () => handleCancel(data2));
  manageCell.appendChild(cancelBtn);

  tr.appendChild(issueCell);
  tr.appendChild(catCell);
  tr.appendChild(priorityCell);
  tr.appendChild(roomCell);
  tr.appendChild(unitCell);
  tr.appendChild(reporterCell);
  tr.appendChild(dateCell);
  tr.appendChild(statusCell);
  tr.appendChild(actionsCell);
  tr.appendChild(manageCell);
  return tr;
}

/**
 * Render the table from `allComplaints`, applying the current filters.
 * Pure in-memory work — no network, so every filter change is instant.
 */
function renderComplaints() {
  const rows = selectVisibleComplaints(allComplaints, {
    search: searchInput?.value,
    status: filterStatus?.value,
    category: filterCategory?.value,
    sort: sortBy?.value,
  });

  tbody.innerHTML = "";
  emptyEl.classList.add("hidden");

  // Announce the result count for screen readers, and explain an
  // over-filtered list instead of showing a silent blank table.
  if (countEl) {
    countEl.textContent = rows.length
      ? `Showing ${rows.length} of ${allComplaints.length} complaint${allComplaints.length === 1 ? "" : "s"}.`
      : "";
  }

  if (rows.length === 0) {
    emptyEl.textContent =
      allComplaints.length === 0
        ? "No complaints from you or your unit mates yet."
        : "No complaints match your filters. Try clearing the search or filters.";
    emptyEl.classList.remove("hidden");
    return;
  }

  rows.forEach((data2) => {
    const labels = labelsByComplaint[data2.id] || { roomLabel: "—", unitLabel: "—" };
    tbody.appendChild(buildComplaintRow(data2, labels.roomLabel, labels.unitLabel));
  });
}

/** Load this resident's complaints AND their unit mates' (newest first). */
async function loadComplaints() {
  try {
    const uid = currentProfile?.uid;
    if (!uid) return;
    const data = await api(
      `/complaints?residentId=${encodeURIComponent(uid)}&scope=unit`
    );
    allComplaints = Array.isArray(data.complaints) ? data.complaints : [];

    loadingEl.classList.add("hidden");

    if (allComplaints.length === 0) {
      populateFilterOptions([]);
      renderComplaints();
      return;
    }

    // Resolve room/unit labels once per complaint. A resident has a single
    // room and unit, and resolveRoomAndUnit caches by id, so this is cheap.
    labelsByComplaint = {};
    for (const complaint of allComplaints) {
      labelsByComplaint[complaint.id] = await resolveRoomAndUnit(
        complaint.roomId,
        complaint.unitId
      );
    }

    populateFilterOptions(allComplaints);
    applyPendingFilterValues();
    renderComplaints();
  } catch (error) {
    console.error("[tracking] load error:", error);
    loadingEl.classList.add("hidden");
    emptyEl.textContent = "Could not load your complaints. Please try again.";
    emptyEl.classList.remove("hidden");
  }
}


/* ------------------------------ Init & wiring ------------------------------ */

reopenBtn.addEventListener("click", handleReopen);
document.querySelectorAll("[data-close-modal]").forEach((el) => {
  el.addEventListener("click", closeModal);
});

// Edit modal wiring.
if (editForm) editForm.addEventListener("submit", handleEditSubmit);
// Changing the category inside the edit modal rebuilds the checklist,
// keeping ticks that are still relevant.
if (editCategory) {
  editCategory.addEventListener("change", () => {
    const stillChecked = Array.from(
      editIssuesBox.querySelectorAll('input[type="checkbox"]:checked')
    ).map((cb) => cb.value);
    renderEditIssues(editCategory.value, stillChecked);
  });
}
document.querySelectorAll("[data-close-edit-modal]").forEach((el) => {
  el.addEventListener("click", closeEditModal);
});

// Escape handling comes from js/modal.js, which only fires for the
// topmost open dialog (so a nested modal closes one layer at a time).
modal.addEventListener("modal:escape", closeModal);
if (editModal) editModal.addEventListener("modal:escape", closeEditModal);

// Filters re-render in memory — no network call, so feedback is instant.
// Every change is mirrored to the URL (?search=&status=&category=&sort=)
// so refresh, back-button and shared links keep the same view.
function syncFiltersToURL() {
  try {
    const params = new URLSearchParams();
    if (searchInput?.value) params.set("search", searchInput.value);
    if (filterStatus?.value) params.set("status", filterStatus.value);
    if (filterCategory?.value) params.set("category", filterCategory.value);
    if (sortBy?.value && sortBy.value !== "newest") params.set("sort", sortBy.value);
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", url);
  } catch (e) {
    /* URL sync is best-effort */
  }
}

function restoreFiltersFromURL() {
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    return;
  }
  if (searchInput && params.get("search")) searchInput.value = params.get("search");
  // Status/category options are populated from data; stash pending values
  // and apply them after populateFilterOptions() runs.
  restoreFiltersFromURL.pendingStatus = params.get("status") || "";
  restoreFiltersFromURL.pendingCategory = params.get("category") || "";
  if (sortBy && params.get("sort")) sortBy.value = params.get("sort");
}

function applyPendingFilterValues() {
  const pendingStatus = restoreFiltersFromURL.pendingStatus;
  const pendingCategory = restoreFiltersFromURL.pendingCategory;
  if (filterStatus && pendingStatus) {
    const has = Array.from(filterStatus.options).some((o) => o.value === pendingStatus);
    if (has) filterStatus.value = pendingStatus;
  }
  if (filterCategory && pendingCategory) {
    const has = Array.from(filterCategory.options).some((o) => o.value === pendingCategory);
    if (has) filterCategory.value = pendingCategory;
  }
  restoreFiltersFromURL.pendingStatus = "";
  restoreFiltersFromURL.pendingCategory = "";
}

function onFilterChange() {
  syncFiltersToURL();
  renderComplaints();
}

if (searchInput) searchInput.addEventListener("input", onFilterChange);
if (filterStatus) filterStatus.addEventListener("change", onFilterChange);
if (filterCategory) filterCategory.addEventListener("change", onFilterChange);
if (sortBy) sortBy.addEventListener("change", onFilterChange);

async function init() {
  const profile = await requireRole(["resident"]);
  if (!profile) return;
  currentProfile = profile;

  renderNav(profile);
  warnIfSessionExpiring({ toast });
  restoreFiltersFromURL();
  await loadComplaints();
}

init();

