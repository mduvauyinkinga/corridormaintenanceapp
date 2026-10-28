/**
 * dashboard.js
 * ------------------------------------------------------------------
 * Resident dashboard (self-coded backend version).
 *
 * Displays the resident's room summary, complaint statistics, active
 * complaints, complaint history, the unit announcements feed, and a
 * quick "Submit complaint" action. Redirects management users to
 * management.html.
 *
 * Data sources (replaces the Firestore queries):
 *   complaints  -> GET /api/complaints?residentId=:uid (once, derived
 *                  in-memory for stats/lists, as before)
 *   announcements-> GET /api/announcements?roomId=:id (newest first)
 *   room fallback-> GET /api/rooms/:id + GET /api/units/:id
 */

import { api } from "./api.js";
import { requireRole } from "./auth.js";
import { renderNav } from "./nav.js";
import {
  formatDate,
  statusBadge,
  normalizeStatus,
  normalizePriority,
  priorityBadge,
  isOverdue,
  renderSkeletons,
  $,
} from "./utils.js";

const noRoomState = $("#no-room-state");
const dashboardState = $("#dashboard-state");

/** Fetch the resident's complaints (cached for the whole page). */
async function loadComplaints(uid) {
  const data = await api(`/complaints?residentId=${encodeURIComponent(uid)}`, {
    auth: true,
  });
  return Array.isArray(data.complaints) ? data.complaints : [];
}

/** Fetch the full unit announcements feed (newest first). */
async function loadUnitAnnouncements(roomId, limit = 5) {
  if (!roomId) return [];
  const data = await api(`/announcements?roomId=${encodeURIComponent(roomId)}`, {
    auth: true,
  });
  const items = Array.isArray(data.announcements) ? data.announcements : [];
  return items.slice(0, limit);
}

/** Render the unit announcements feed with show more/less. */
function renderAnnouncementsFeed(container, announcements) {
  container.innerHTML = "";
  if (!announcements.length) {
    const empty = document.createElement("div");
    empty.className = "notes-list__empty";
    empty.textContent = "No announcements yet.";
    container.appendChild(empty);
    return;
  }
  const list = document.createElement("div");
  list.className = "announcements";
  const COLLAPSED_COUNT = 2;
  let expanded = false;

  const draw = () => {
    list.innerHTML = "";
    const visible = expanded ? announcements : announcements.slice(0, COLLAPSED_COUNT);
    visible.forEach((a) => {
      const item = document.createElement("div");
      item.className = "announcement-item";
      const text = document.createElement("div");
      text.className = "announcement-item__text";
      text.textContent = a.message || "";
      const meta = document.createElement("div");
      meta.className = "announcement-item__meta";
      meta.textContent = `${a.authorName || "Management"} · ${formatDate(a.createdAt)}`;
      item.append(text, meta);
      list.appendChild(item);
    });
  };
  draw();
  container.appendChild(list);

  if (announcements.length > COLLAPSED_COUNT) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "btn btn--ghost btn--sm announcements__toggle";
    const paint = () => {
      toggle.textContent = expanded
        ? "Show less"
        : `Show ${announcements.length - COLLAPSED_COUNT} more`;
      toggle.setAttribute("aria-expanded", String(expanded));
    };
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      draw();
      paint();
    });
    paint();
    container.appendChild(toggle);
  }
}

/** Build a compact complaint card for the dashboard lists. */
function complaintCard(complaint) {
  const card = document.createElement("div");
  card.className = "complaint-card";

  const head = document.createElement("div");
  head.className = "complaint-card__head";

  const title = document.createElement("span");
  title.className = "complaint-card__title";
  title.textContent = complaint.category || "Complaint";

  const statusEl = document.createElement("span");
  const status = normalizeStatus(complaint.status);
  const badge = document.createElement("span");
  badge.className = statusBadge(status);
  badge.textContent = status;
  statusEl.appendChild(badge);

  head.appendChild(title);
  head.appendChild(statusEl);

  const meta = document.createElement("div");
  meta.className = "complaint-card__meta";
  const parts = [];
  if (Array.isArray(complaint.issues) && complaint.issues.length) {
    parts.push(complaint.issues.join(", "));
  }
  const priority = normalizePriority(complaint.priority);
  if (priority !== "Low" || complaint.priority) {
    const pBadge = document.createElement("span");
    pBadge.className = priorityBadge(priority);
    pBadge.textContent = priority;
    meta.appendChild(pBadge);
  }
  if (isOverdue(complaint)) {
    const ov = document.createElement("span");
    ov.className = "badge badge--overdue";
    ov.textContent = "Overdue";
    meta.appendChild(ov);
  }
  const dateSpan = document.createElement("span");
  dateSpan.textContent = ` · ${formatDate(complaint.createdAt)}`;
  meta.appendChild(dateSpan);

  card.appendChild(head);
  card.appendChild(meta);
  return card;
}
async function renderDashboard(profile) {
  // Greeting.
  const firstName = profile.name ? profile.name.split(" ")[0] : "there";
  $("#greeting-name").textContent = `Hello, ${firstName}!`;
  $("#greeting-sub").textContent = "Here's your residence overview.";

  // Room summary (prefer denormalized fields; fallback to room/unit docs).
  let block = profile.block;
  let roomNumber = profile.roomNumber;
  let roomLetter = profile.roomLetter;
  if (
    (block == null || roomNumber == null || roomLetter == null) &&
    (profile.roomId || profile.unitId)
  ) {
    try {
      const roomData = profile.roomId
        ? await api(`/rooms/${encodeURIComponent(profile.roomId)}`, { auth: true })
        : null;
      const unitData = profile.unitId
        ? await api(`/units/${encodeURIComponent(profile.unitId)}`, { auth: true })
        : null;
      const room = roomData ? roomData.room : null;
      const unit = unitData ? unitData.unit : null;
      block = block ?? room?.block;
      roomNumber = roomNumber ?? room?.roomNumber;
      roomLetter = roomLetter ?? unit?.roomLetter ?? unit?.unitName;
    } catch (error) {
      console.error("[dashboard] room fallback error:", error);
    }
  }
  $("#summary-block").textContent = block ?? "—";
  $("#summary-room").textContent = roomNumber ?? "—";
  $("#summary-unit").textContent = roomLetter ?? "—";

  // Load complaints (single query).
  let complaints = [];
  try {
    complaints = await loadComplaints(profile.uid);
  } catch (error) {
    console.error("[dashboard] load complaints error:", error);
  }

  // Statistics.
  const active = complaints.filter(
    (c) =>
      normalizeStatus(c.status) !== "Completed" &&
      normalizeStatus(c.status) !== "Cancelled"
  );
  const inProgress = complaints.filter(
    (c) => normalizeStatus(c.status) === "In Progress"
  );
  const completed = complaints.filter(
    (c) => normalizeStatus(c.status) === "Completed"
  );
  const overdue = complaints.filter((c) => isOverdue(c));
  $("#stat-total").textContent = complaints.length;
  $("#stat-active").textContent = active.length;
  $("#stat-inprogress").textContent = inProgress.length;
  $("#stat-completed").textContent = completed.length;

  // Active complaints list.
  const activeContainer = $("#active-complaints");
  activeContainer.innerHTML = "";
  // Overdue banner: surfaced once above the list so it cannot be missed.
  if (overdue.length > 0) {
    const banner = document.createElement("div");
    banner.className = "overdue-banner";
    banner.setAttribute("role", "alert");
    banner.textContent =
      overdue.length === 1
        ? "1 complaint is past its estimated completion date."
        : `${overdue.length} complaints are past their estimated completion dates.`;
    const link = document.createElement("a");
    link.href = "tracking.html";
    link.textContent = "View them →";
    banner.appendChild(link);
    activeContainer.appendChild(banner);
  }
  if (active.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dashboard__list-empty";
    empty.textContent = "You have no active complaints. 🎉 ";
    const cta = document.createElement("a");
    cta.href = "complaint.html";
    cta.textContent = "Report an issue →";
    empty.appendChild(cta);
    activeContainer.appendChild(empty);
  } else {
    active.forEach((c) => activeContainer.appendChild(complaintCard(c)));
  }

  // Complaint history (all, newest first — already sorted).
  const historyContainer = $("#complaint-history");
  historyContainer.innerHTML = "";
  if (complaints.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dashboard__list-empty";
    empty.textContent = "You haven't submitted any complaints yet. ";
    const cta = document.createElement("a");
    cta.href = "complaint.html";
    cta.textContent = "Submit your first complaint →";
    empty.appendChild(cta);
    historyContainer.appendChild(empty);
  } else {
    complaints.forEach((c) => historyContainer.appendChild(complaintCard(c)));
  }

  // Unit announcements feed (newest 5, collapsed to 2 + toggle).
  // All maintenance/manager announcements surface here.
  const feedEl = $("#announcements-feed");
  if (feedEl) {
    try {
      const feed = await loadUnitAnnouncements(profile.roomId, 5);
      renderAnnouncementsFeed(feedEl, feed);
    } catch (error) {
      console.error("[dashboard] announcements feed error:", error);
      feedEl.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "notes-list__empty";
      empty.textContent = "Could not load announcements.";
      feedEl.appendChild(empty);
    }
  }
}

async function init() {
  const profile = await requireRole(["resident"]);
  if (!profile) return; // Guard redirected.

  renderNav(profile);
  document.title = `Dashboard | ${profile.name}`;

  if (!profile.roomId) {
    noRoomState.classList.remove("hidden");
    dashboardState.classList.add("hidden");
    return;
  }

  dashboardState.classList.remove("hidden");
  // Instant skeleton placeholders — replaced by real data when it arrives.
  renderSkeletons($("#active-complaints"), 2);
  renderSkeletons($("#complaint-history"), 3);
  await renderDashboard(profile);
}

init();

