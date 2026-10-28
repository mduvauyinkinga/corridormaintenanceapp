/**
 * timeline.js
 * ------------------------------------------------------------------
 * Complaint timeline helpers (self-coded backend version).
 *
 * Every complaint keeps a chronological history in the timeline_events
 * table, served via:
 *   GET /api/complaints/:id/timeline  -> events, oldest first
 *
 * Provides (same signatures as the Firebase version, so callers in
 * tracking.js / management.js / complaints.js don't change):
 *   - addTimelineEvent()   : no-op client-side (the server writes events
 *                            atomically with each mutation — create, edit,
 *                            cancel, status, priority, dates, reopen).
 *   - loadTimeline()       : read all events (ascending).
 *   - renderTimeline()     : build the timeline DOM (unchanged).
 */

import { api } from "./api.js";
import { formatDateTime, $ } from "./utils.js";

/**
 * Record a timeline event. The backend writes events server-side with
 * each mutation, so this is a no-op kept for signature compatibility.
 * (Callers that previously wrote events directly can drop the call —
 * leaving it in place is harmless.)
 *
 * @param {string} complaintId - The complaint ID.
 * @param {object} event - { action, description, authorId, authorName, authorRole }.
 */
export async function addTimelineEvent(complaintId, event) {
  if (!complaintId) return;
  return;
}

/**
 * Load all timeline events for a complaint, oldest first.
 * Resolves to an array of { id, action, description, ... } events.
 */
export async function loadTimeline(complaintId) {
  if (!complaintId) return [];
  const data = await api(`/complaints/${encodeURIComponent(complaintId)}/timeline`, {
    auth: true,
  });
  return Array.isArray(data.events) ? data.events : [];
}
/**
 * Render a timeline event list into a container.
 * Same DOM as before: newest first, action + description + meta line.
 */
export function renderTimeline(container, events) {
  const timelineEl = typeof container === "string" ? $(container) : container;
  if (!timelineEl) return;

  timelineEl.innerHTML = "";

  if (!events || events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "timeline__empty";
    empty.textContent = "No timeline events yet.";
    timelineEl.appendChild(empty);
    return;
  }

  const timelineItems = document.createElement("div");
  timelineItems.className = "timeline__items";

  // Show newest first.
  [...events].reverse().forEach((event) => {
    const item = document.createElement("div");
    item.className = "timeline__item";

    const dot = document.createElement("div");
    dot.className = "timeline__dot";
    item.appendChild(dot);

    const content = document.createElement("div");
    content.className = "timeline__content";

    const action = document.createElement("div");
    action.className = "timeline__action";
    action.textContent = event.action || "Update";
    content.appendChild(action);

    if (event.description) {
      const desc = document.createElement("div");
      desc.className = "timeline__description";
      desc.textContent = event.description;
      content.appendChild(desc);
    }

    const meta = document.createElement("div");
    meta.className = "timeline__meta";
    const author = event.authorName || "System";
    const role = event.authorRole ? ` (${event.authorRole})` : "";
    meta.textContent = `${author}${role} · ${formatDateTime(event.createdAt)}`;
    content.appendChild(meta);

    item.appendChild(content);
    timelineItems.appendChild(item);
  });

  timelineEl.appendChild(timelineItems);
}

