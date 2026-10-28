/**
 * services/noteService.js
 * ------------------------------------------------------------------
 * Maintenance notes for a complaint:
 *   GET /api/complaints/:id/notes  -> all notes, oldest first
 *   POST /api/complaints/:id/notes -> management only
 *
 * Port of the note handling in js/management.js (`loadNotes`,
 * `handleAddNote`) and the resident read path in js/tracking.js.
 *
 * Residents can READ notes on their own complaint but can never create
 * or edit them — enforced server-side (requireRole management on POST);
 * the mobile app only exposes "add note" inside the management screens.
 */

import { api } from "./api";

/** All notes for a complaint, oldest first (management + resident read). */
export async function fetchNotes(complaintId) {
  if (!complaintId) return [];
  const data = await api(`/complaints/${encodeURIComponent(complaintId)}/notes`);
  return Array.isArray(data.notes) ? data.notes : [];
}

/**
 * Latest maintenance note for a complaint, or null.
 * Used by the resident dashboard's "Latest Maintenance Update" card and
 * reads a single document exactly like js/dashboard.js (last of the
 * oldest-first list).
 */
export async function fetchLatestNote(complaintId) {
  if (!complaintId) return null;
  const notes = await fetchNotes(complaintId);
  return notes.length ? notes[notes.length - 1] : null;
}

/** Management only: add a maintenance note to a complaint. */
export async function addNote(complaintId, { text, authorId, authorName }) {
  if (!complaintId || !text) return;
  await api(`/complaints/${encodeURIComponent(complaintId)}/notes`, {
    method: "POST",
    body: { text },
  });
}
