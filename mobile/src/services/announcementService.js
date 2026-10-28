/**
 * services/announcementService.js
 * ------------------------------------------------------------------
 * Shared room/unit announcements:
 *   GET  /api/announcements?roomId=        -> all for a room, newest first
 *   GET  /api/announcements/latest?roomId= -> newest one or null
 *   POST /api/announcements                -> management only
 *
 * Port of js/management.js (`loadUnitAnnouncements`,
 * `handleUnitAnnouncement`) and the resident read path in js/dashboard.js
 * (`loadUnitAnnouncements` feed).
 *
 * Access rules live on the server (requireAuth for reads, management
 * role for writes); message length (1..500) is enforced both here for a
 * friendly error and server-side. Reactions: update/delete are not
 * offered by the API — so the mobile client never offers editing or
 * deleting an announcement.
 */

import { api } from "./api";
import { MAX_ANNOUNCEMENT_LENGTH } from "../utils/validation";

/** All shared updates for a room, newest first (management + resident). */
export async function fetchAnnouncements(roomId) {
  if (!roomId) return [];
  const data = await api(`/announcements?roomId=${encodeURIComponent(roomId)}`);
  return Array.isArray(data.announcements) ? data.announcements : [];
}

/** Newest shared update for a room (resident dashboard card). */
export async function fetchLatestAnnouncement(roomId) {
  if (!roomId) return null;
  const data = await api(`/announcements/latest?roomId=${encodeURIComponent(roomId)}`);
  return data.announcement || null;
}

/**
 * Management only: send one shared update to everybody in a room.
 * The author name comes from the signed-in profile on the server.
 */
export async function sendAnnouncement({ roomId, message, authorName }) {
  const text = String(message || "").trim();
  if (!roomId || !text) {
    throw new Error("Please enter a message before sending.");
  }
  if (text.length > MAX_ANNOUNCEMENT_LENGTH) {
    throw new Error(`Messages can be at most ${MAX_ANNOUNCEMENT_LENGTH} characters.`);
  }

  await api("/announcements", {
    method: "POST",
    body: { roomId, message: text },
  });
}
