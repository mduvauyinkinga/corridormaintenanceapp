/**
 * services/roomService.js
 * ------------------------------------------------------------------
 * Room / unit queries and the atomic "claim my bed" call.
 *
 * Port of:
 *   - js/choose-room.js  (rooms by block, units by room, confirm claim)
 *   - js/tracking.js     (resolveRoomAndUnit display labels)
 *
 * Authenticated REST calls against the self-coded backend (replaces the
 * Firestore queries + transaction). Reads stay incremental (per block,
 * per room) exactly like the website.
 */

import { api } from "./api";
import { sortRooms } from "../utils/rooms";

/** Rooms in one block: GET /api/rooms?block=<block> (js/choose-room.js). */
export async function fetchRoomsByBlock(block) {
  const data = await api(`/rooms?block=${encodeURIComponent(block)}`);
  const rooms = Array.isArray(data.rooms) ? data.rooms : [];
  return sortRooms(rooms);
}

/** A single room document, or null. */
export async function fetchRoom(roomId) {
  if (!roomId) return null;
  try {
    const data = await api(`/rooms/${encodeURIComponent(roomId)}`);
    return data.room || null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

/** All bed slots belonging to a parent room: GET /api/units?roomId=<id>. */
export async function fetchUnitsByRoom(roomId) {
  const data = await api(`/units?roomId=${encodeURIComponent(roomId)}`);
  return Array.isArray(data.units) ? data.units : [];
}

/** A single unit (bed slot) document, or null. */
export async function fetchUnit(unitId) {
  if (!unitId) return null;
  try {
    const data = await api(`/units/${encodeURIComponent(unitId)}`);
    return data.unit || null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

/**
 * Resolve the display labels used by the tracking screens.
 * Cached per page session by the caller, mirroring js/tracking.js which
 * avoids N+1 reads by caching because a resident owns a single room/unit.
 */
export async function resolveRoomAndUnitLabels(roomId, unitId, cache) {
  let roomLabel = roomId || "—";
  let unitLabel = unitId || "—";

  try {
    if (roomId) {
      if (cache?.room?.[roomId]) {
        roomLabel = cache.room[roomId];
      } else {
        const room = await fetchRoom(roomId);
        roomLabel = room?.roomNumber ?? roomId;
        if (cache?.room) cache.room[roomId] = roomLabel;
      }
    }
    if (unitId) {
      if (cache?.unit?.[unitId]) {
        unitLabel = cache.unit[unitId];
      } else {
        const unit = await fetchUnit(unitId);
        unitLabel = unit?.unitName ?? unitId;
        if (cache?.unit) cache.unit[unitId] = unitLabel;
      }
    }
  } catch (error) {
    console.warn("[roomService] could not resolve room/unit:", error);
  }

  return { roomLabel, unitLabel };
}

/**
 * Claim a bed slot for the signed-in resident.
 *
 * Calls POST /api/units/claim — the server performs the same atomic
 * steps the Firestore transaction used to: re-read the unit, refuse
 * when occupied, refuse when the resident already has a room, mark the
 * unit occupied and write the assignment onto the profile. The uid
 * comes from the verified JWT server-side (never from this payload).
 *
 * `uid` stays in the signature for call-site parity but is ignored.
 */
export async function claimUnit({ uid, unit, room }) {
  if (!uid || !unit?.id || !room?.id) {
    throw new Error("Missing selection. Please choose a room again.");
  }

  await api("/units/claim", {
    method: "POST",
    body: {
      unitId: unit.id,
      roomId: room.id,
      block: room.block ?? unit.block ?? null,
      roomNumber: Number(room.roomNumber ?? unit.roomNumber),
    },
  });
}

/**
 * Repair bed slots left occupied by a resident profile that no longer
 * exists. Calls the management endpoint POST /api/admin/release-orphans
 * (replaces the old client-side batch writes + Cloud Function), then
 * keeps the in-memory unit objects consistent, exactly like the
 * website's releaseOrphanedUnits did.
 */
export async function releaseOrphanedUnits(units, usersMap) {
  const orphaned = (units || []).filter(
    (unit) => unit.occupied === true && unit.residentId && !usersMap?.[unit.residentId]
  );
  if (orphaned.length === 0) return 0;

  const data = await api("/admin/release-orphans", { method: "POST" });
  const released = Number(data && data.released) || 0;

  // Keep the in-memory objects consistent with the server-side repair.
  orphaned.forEach((unit) => {
    unit.occupied = false;
    unit.residentId = null;
  });

  return released;
}
