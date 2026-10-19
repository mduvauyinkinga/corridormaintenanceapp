/**
 * utils/dates.js
 * ------------------------------------------------------------------
 * Date helpers ported from `js/utils.js` (formatDate, formatDateTime,
 * isOverdue) plus the helpers used by the management date controls
 * (`toDateInputValue` in js/management.js).
 *
 * Firestore Timestamp values arrive as objects with a `toDate()` method,
 * legacy values may be plain `{ seconds }` objects, JS Dates or ISO
 * strings — every helper handles all four shapes, like the website does.
 */

import { normalizeStatus } from "./complaints";

/** Convert any stored date-like value into a JS Date (or null). */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate(); // Firestore Timestamp
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Millisecond epoch for sorting (js/management.js `ts`). */
export function timestampMs(value) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

/** "12 Mar 2026" — matches formatDate() on the website. */
export function formatDate(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "12 Mar 2026, 14:05" — matches formatDateTime() on the website. */
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * True when a complaint is not Completed and its estimated completion
 * date is in the past (js/utils.js `isOverdue`).
 */
export function isOverdue(complaint) {
  if (!complaint) return false;
  if (normalizeStatus(complaint.status) === "Completed") return false;
  const date = toDate(complaint.estimatedCompletion);
  if (!date) return false;
  return date.getTime() < Date.now();
}

/** "YYYY-MM-DD" for date controls / filters (management.js `toDateInputValue`). */
export function toDateInputValue(value) {
  const date = toDate(value);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Parse a "YYYY-MM-DD" control value into exactly the value the website
 * writes: `new Date(`${value}T00:00:00`)` (management.js handleDatesChange).
 */
export function fromDateInputValue(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

/** Today as "YYYY-MM-DD" (used by the date filter default state). */
export function todayInputValue() {
  return toDateInputValue(new Date());
}
