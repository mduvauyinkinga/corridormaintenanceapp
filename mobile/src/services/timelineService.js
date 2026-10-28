/**
 * services/timelineService.js
 * ------------------------------------------------------------------
 * Port of the website's `js/timeline.js` (REST version).
 *
 * Every complaint keeps a chronological history, written by the SERVER
 * whenever something happens (submit, edit, cancel, status, priority,
 * dates, reopen decisions). Clients only READ the timeline:
 *   GET /api/complaints/:id/timeline -> { events } oldest first
 *
 * There is deliberately no client "add event" call — the server records
 * events itself with the author taken from the verified token, so a
 * timeline can never be forged by a client.
 */

import { api } from "./api";

/** Load every timeline event of a complaint, oldest first. */
export async function fetchTimeline(complaintId) {
  if (!complaintId) return [];
  const data = await api(`/complaints/${encodeURIComponent(complaintId)}/timeline`);
  return Array.isArray(data.events) ? data.events : [];
}
