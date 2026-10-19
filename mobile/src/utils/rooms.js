/**
 * utils/rooms.js
 * ------------------------------------------------------------------
 * Block / room / unit (bed slot) helpers.
 *
 * Ported from the website:
 *   - js/choose-room.js → BLOCKS, slot grouping by room letter
 *   - js/management.js  → getRoomBedSlots(), getSubRooms()
 *
 * Data model reminder (identical to the website):
 *   rooms/{roomId}         e.g. "A101"      → { block, floor, roomNumber, roomId, roomLabel }
 *   units/{unitId}         e.g. "A101-A-1"  → { roomId, roomLetter, unitName, bedNumber, occupied, residentId }
 *
 * Every parent room has three sub-rooms (A, B, C) and each sub-room has
 * two separately claimable bed slots (bedNumber 1 and 2).
 */

/** Static block list used by the "choose room" flow (js/choose-room.js). */
export const BLOCKS = ["A", "B", "C", "D", "E", "F"];

/** Sub-room letters inside every parent room. */
export const ROOM_LETTERS = ["A", "B", "C"];

/**
 * Numeric-aware comparison for room numbers.
 *
 * The website uses `localeCompare(..., { numeric: true })`. Hermes has a
 * reduced Intl implementation, so the mobile client compares numerically
 * instead — identical ordering for the Corridor Hill data set.
 */
export function compareNumeric(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

/** Sort room documents by room number (numeric, ascending). */
export function sortRooms(rooms) {
  return [...rooms].sort((a, b) => compareNumeric(a.roomNumber, b.roomNumber));
}

/**
 * Return the bed slots that currently define a room's capacity.
 *
 * Modern data has two slots per letter (bedNumber 1 and 2). If a legacy
 * single-slot document is still present, it is used only as a fallback —
 * exactly like `getRoomBedSlots()` in js/management.js, so old records
 * can never inflate capacity.
 */
export function getRoomBedSlots(units = []) {
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
    return modernSlots.length > 0 ? modernSlots : letterUnits.slice(0, 1);
  });
}

/** Group bed slots into the three resident sub-rooms (A, B, C). */
export function getSubRooms(units = []) {
  const groups = new Map();
  getRoomBedSlots(units).forEach((slot) => {
    const letter = slot.roomLetter || slot.unitName || "?";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(slot);
  });
  return Array.from(groups.entries())
    .map(([letter, slots]) => ({ letter, slots }))
    .sort((a, b) => String(a.letter).localeCompare(String(b.letter)));
}

/**
 * Group the units of one parent room by room letter (js/choose-room.js).
 * Only real bed slots (integer bedNumber) are considered, and every letter
 * is reported — even when it has no data — so the UI always shows A/B/C.
 */
export function groupSlotsByLetter(units = []) {
  const byLetter = new Map();
  units
    .filter((unit) => Number.isInteger(unit.bedNumber))
    .forEach((unit) => {
      const letter = unit.roomLetter || unit.unitName;
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(unit);
    });

  return ROOM_LETTERS.map((letter) => {
    const slots = (byLetter.get(letter) || []).sort((a, b) => a.bedNumber - b.bedNumber);
    const availableSlots = slots.filter((slot) => slot.occupied === false);
    return {
      letter,
      slots,
      availableSlots,
      available: availableSlots.length > 0,
    };
  });
}

/** Units that belong to a parent room, grouped for the management views. */
export function unitsByRoomMap(units = []) {
  const map = {};
  units.forEach((unit) => {
    if (!unit.roomId) return;
    if (!map[unit.roomId]) map[unit.roomId] = [];
    map[unit.roomId].push(unit);
  });
  return map;
}
