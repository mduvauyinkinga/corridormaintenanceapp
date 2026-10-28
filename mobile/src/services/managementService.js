/**
 * services/managementService.js
 * ------------------------------------------------------------------
 * Data shaping for the management side of the app.
 *
 * Port of the read/derive logic in js/management.js:
 *   - loadManagementData()   -> users + (rooms, units, complaints) from the
 *                              admin endpoints in parallel (the only bulk
 *                              reads; everything else is derived in memory)
 *   - computeStats()         -> renderStats() counters
 *   - resolveComplaintRow()  -> complaint card/list display fields
 *   - filterComplaintRows()  -> search + status/category/block/floor/date + sort
 *   - buildRoomProfiles()    -> Unit Profiles grouping (residents + complaints)
 *   - resolveRoomProfile()   -> room profile display fields
 */

import { api, resolvePhotoURL } from "./api";
import {
  isActiveStatus,
  normalizePriority,
  normalizeStatus,
  shortComplaintId,
} from "../utils/complaints";
import { timestampMs, toDate } from "../utils/dates";
import { getRoomBedSlots, getSubRooms, unitsByRoomMap } from "../utils/rooms";

/**
 * Fetch the management data set: GET /api/admin/users plus
 * GET /api/admin/overview (rooms + units + complaints in one round
 * trip — the REST equivalent of the website's loadAllData).
 * Complaints are sorted newest-first once, in memory, like the website.
 */
export async function loadManagementData() {
  const [usersData, overview] = await Promise.all([
    api("/admin/users"),
    api("/admin/overview"),
  ]);

  const usersMap = {};
  (usersData.users || []).forEach((u) => {
    usersMap[u.uid] = u;
  });

  const roomsMap = {};
  (overview.rooms || []).forEach((r) => {
    roomsMap[r.id] = r;
  });

  const unitsMap = {};
  (overview.units || []).forEach((unit) => {
    unitsMap[unit.id] = unit;
  });

  const complaints = (overview.complaints || []).map((c) => ({
    ...c,
    photoURLs: Array.isArray(c.photoURLs)
      ? c.photoURLs.map(resolvePhotoURL)
      : [],
  }));
  complaints.sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));

  return {
    usersMap,
    roomsMap,
    unitsMap,
    unitsByRoom: unitsByRoomMap(Object.values(unitsMap)),
    complaints,
  };
}

/** Every bed slot the console counts (modern slots only). */
export function allBedSlots(unitsByRoom) {
  return Object.values(unitsByRoom || {}).flatMap((units) => getRoomBedSlots(units));
}

/** Overview statistics shown under the management header (renderStats). */
export function computeStats({ usersMap, roomsMap, unitsByRoom, complaints }) {
  const residents = Object.values(usersMap || {}).filter((u) => u.role === "resident");
  const units = allBedSlots(unitsByRoom);
  const occupied = units.filter((u) => u.occupied === true).length;

  const counts = { Submitted: 0, "In Progress": 0, "Waiting for Parts": 0, Completed: 0 };
  (complaints || []).forEach((c) => {
    const status = normalizeStatus(c.status);
    if (status in counts) counts[status] += 1;
  });

  return {
    residents: residents.length,
    rooms: Object.keys(roomsMap || {}).length,
    occupied,
    available: units.length - occupied,
    complaints: (complaints || []).length,
    submitted: counts.Submitted,
    inProgress: counts["In Progress"],
    waiting: counts["Waiting for Parts"],
    completed: counts.Completed,
  };
}

/* --------------------------- Row resolution ----------------------------- */

function getRoomOf(roomsMap, complaint) {
  const roomId = complaint.roomId;
  return (roomId && roomsMap[roomId]) || null;
}

function getUnitOf({ roomsMap, unitsMap, unitsByRoom }, complaint) {
  if (complaint.unitId && unitsMap[complaint.unitId]) {
    return unitsMap[complaint.unitId];
  }
  const room = getRoomOf(roomsMap, complaint);
  if (room && unitsByRoom[room.id]?.length > 0) {
    return unitsByRoom[room.id][0];
  }
  return null;
}

/**
 * Resolve every display field for a complaint row, with the same fallbacks
 * as resolveComplaintRow() in js/management.js (prefer denormalised ids,
 * then the resident's unit, then the room's first slot).
 */
export function resolveComplaintRow(complaint, data) {
  const resident = data.usersMap?.[complaint.residentId] || null;
  const room = getRoomOf(data.roomsMap || {}, complaint);
  const unit = getUnitOf(
    {
      roomsMap: data.roomsMap || {},
      unitsMap: data.unitsMap || {},
      unitsByRoom: data.unitsByRoom || {},
    },
    complaint
  );

  return {
    id: complaint.id,
    shortId: shortComplaintId(complaint.id),
    name: resident?.name || "Unknown",
    studentNumber: resident?.studentNumber || "—",
    email: resident?.email || "",
    block: unit?.block || room?.block || "—",
    roomNumber: unit?.roomNumber ?? room?.roomNumber ?? "—",
    roomLetter: unit?.roomLetter || unit?.unitName || "—",
    floorValue: room?.floor ?? unit?.floor ?? "",
    issues: Array.isArray(complaint.issues)
      ? complaint.issues.join(", ")
      : String(complaint.issues || "—"),
    status: normalizeStatus(complaint.status),
    category: complaint.category || "—",
    priority: normalizePriority(complaint.priority),
    photoURLs: Array.isArray(complaint.photoURLs) ? complaint.photoURLs : [],
    estimatedCompletion: complaint.estimatedCompletion || null,
    actualCompletion: complaint.actualCompletion || null,
    createdAt: complaint.createdAt,
    updatedAt: complaint.updatedAt,
    notes: complaint.notes || "",
    residentId: complaint.residentId,
    roomId: complaint.roomId,
    unitId: complaint.unitId,
    reopenRequested: Boolean(complaint.reopenRequested),
    reopenStatus: complaint.reopenStatus || null,
  };
}

/** Resolve every complaint into a row, once, for the list + filters. */
export function resolveAllRows(complaints, data) {
  return complaints.map((complaint) => resolveComplaintRow(complaint, data));
}

/* ------------------------------ Filtering ------------------------------- */

/** Default search/filter/sort state for the management complaint list. */
export const EMPTY_FILTERS = {
  term: "",
  status: "",
  category: "",
  block: "",
  floor: "",
  date: "",
  sort: "newest",
};

/**
 * Apply search + filters + sorting exactly like getFilteredRows().
 * `rows` must be resolved complaint rows (see resolveAllRows).
 */
export function filterComplaintRows(rows, filters) {
  const { term, status, category, block, floor, date, sort } = {
    ...EMPTY_FILTERS,
    ...filters,
  };
  let list = [...rows];

  const needle = String(term || "").trim().toLowerCase();
  if (needle) {
    list = list.filter((r) => {
      const haystack = [
        r.name,
        r.studentNumber,
        String(r.block),
        String(r.roomNumber),
        String(r.roomLetter),
        r.id,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  if (status) list = list.filter((r) => r.status === status);
  if (category) list = list.filter((r) => r.category === category);
  if (block) list = list.filter((r) => r.block === block);
  if (floor) list = list.filter((r) => String(r.floorValue) === String(floor));
  if (date) {
    list = list.filter((r) => {
      const parsed = toDate(r.createdAt);
      if (!parsed) return false;
      const iso = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(parsed.getDate()).padStart(2, "0")}`;
      return iso === date;
    });
  }

  switch (sort) {
    case "oldest":
      list.sort((a, b) => timestampMs(a.createdAt) - timestampMs(b.createdAt));
      break;
    case "status":
      list.sort((a, b) => String(a.status).localeCompare(String(b.status)));
      break;
    case "block":
      list.sort((a, b) =>
        String(a.block).localeCompare(String(b.block), undefined, { numeric: true })
      );
      break;
    default:
      list.sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));
  }

  return list;
}

/* --------------------------- Room profiles ------------------------------ */

/**
 * Group rooms, their residents and their complaints into room profiles.
 * Direct port of buildRoomProfiles() in js/management.js including the
 * fallback chain that places a resident/complaint into the right room.
 */
export function buildRoomProfiles({ usersMap, roomsMap, unitsMap, unitsByRoom, complaints }) {
  const profiles = new Map();

  Object.keys(roomsMap || {}).forEach((roomId) => {
    profiles.set(roomId, {
      roomId,
      room: roomsMap[roomId],
      units: getRoomBedSlots(unitsByRoom[roomId] || []),
      residents: [],
      complaints: [],
    });
  });

  Object.values(usersMap || {})
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

  (complaints || []).forEach((complaint) => {
    let unit = complaint.unitId ? unitsMap[complaint.unitId] : null;
    if (!unit) {
      const resident = usersMap[complaint.residentId];
      unit = (resident?.unitId && unitsMap[resident.unitId]) || null;
      if (!unit) unit = getUnitOf({ roomsMap, unitsMap, unitsByRoom }, complaint);
    }
    const roomKey = unit?.roomId || complaint.roomId || null;
    if (roomKey && profiles.has(roomKey)) {
      profiles.get(roomKey).complaints.push(complaint);
    }
  });

  // Drop rooms without bed slots so capacity numbers stay honest.
  Array.from(profiles.keys()).forEach((key) => {
    if (profiles.get(key).units.length === 0) profiles.delete(key);
  });

  return profiles;
}

/** Resolve a room profile into display fields (resolveRoomProfile). */
export function resolveRoomProfile(profile) {
  const room = profile.room;
  const units = profile.units;
  const block = room?.block || units[0]?.block || "—";
  const roomNumber = room?.roomNumber ?? units[0]?.roomNumber ?? "—";
  const occupiedCount = units.filter((u) => u.occupied === true).length;
  const activeCount = profile.complaints.filter((c) => isActiveStatus(c.status)).length;

  return {
    roomId: profile.roomId,
    label: `${block} ${roomNumber}`,
    block,
    roomNumber,
    floor: room?.floor ?? units[0]?.floor ?? null,
    units,
    subRooms: getSubRooms(units),
    occupiedCount,
    availableCount: units.length - occupiedCount,
    residents: profile.residents,
    complaintCount: profile.complaints.length,
    activeCount,
    complaints: profile.complaints,
  };
}

/** Blocks that actually have rooms, ascending (Unit Profiles block picker). */
export function listBlocks(profiles) {
  const blocks = new Set();
  Array.from(profiles.values()).forEach((p) => {
    const block = p.room?.block || p.units[0]?.block || null;
    if (block) blocks.add(block);
  });
  return Array.from(blocks).sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
}

/**
 * Room profile cards for one block, honouring search + status filters
 * (renderUnits in js/management.js), with the same ordering: rooms that
 * have at least one occupied bed first, then by block/room number.
 */
export function buildUnitCards(profiles, { block, term = "", status = "" } = {}) {
  let cards = Array.from(profiles.values()).map(resolveRoomProfile);

  const needle = String(term || "").trim().toLowerCase();
  if (needle) {
    cards = cards.filter((card) => {
      const haystack = [
        card.label,
        card.roomId,
        card.block,
        String(card.roomNumber),
        card.units.map((u) => u.roomLetter || u.unitName || "").join(" "),
        card.residents.map((r) => r.name || "").join(" "),
        card.residents.map((r) => r.studentNumber || "").join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  if (block) cards = cards.filter((c) => c.block === block);
  if (status === "occupied") cards = cards.filter((c) => c.occupiedCount > 0);
  // A room is available whenever it has at least one free bed (incl. F506-C
  // with a single resident remaining) — same rule as the website.
  if (status === "available") cards = cards.filter((c) => c.availableCount > 0);
  if (status === "has-complaints") cards = cards.filter((c) => c.complaintCount > 0);

  cards.sort((a, b) => {
    const aOccupied = a.occupiedCount > 0;
    const bOccupied = b.occupiedCount > 0;
    if (aOccupied !== bOccupied) return aOccupied ? -1 : 1;
    return String(a.label).localeCompare(String(b.label), undefined, { numeric: true });
  });

  return cards;
}
