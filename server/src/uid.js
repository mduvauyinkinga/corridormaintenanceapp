/**
 * uid.js
 * ------------------------------------------------------------------
 * Generates a random user ID in the same style as Firebase Auth UIDs:
 * a 28-character alphanumeric string. Keeping the format identical
 * means migrated data and new data look the same in the database.
 */
import crypto from "crypto";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Return a random alphanumeric ID of the requested length.
 * @param {number} length - Number of characters (default 28).
 * @returns {string}
 */
export function generateUid(length = 28) {
  const bytes = crypto.randomBytes(length);
  let uid = "";
  for (let i = 0; i < length; i += 1) {
    uid += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return uid;
}

/**
 * Generate a random ID for any entity (complaints, notes, events...).
 * Uses the URL-safe base64 alphabet Firebase uses for document IDs.
 * @param {number} length - Number of characters (default 20).
 * @returns {string}
 */
export function generateId(length = 20) {
  return crypto.randomBytes(Math.ceil((length * 3) / 4))
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length);
}