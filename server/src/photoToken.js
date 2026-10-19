/**
 * photoToken.js
 * ------------------------------------------------------------------
 * Short-lived signed URLs for complaint photos.
 *
 * WHY THIS EXISTS
 * Photo bytes are served from GET /api/complaints/:id/photos/:photoId,
 * which sits behind the JWT guard. Browsers and React Native render
 * photos with `<img src>` / `<Image source>`, and NEITHER can attach an
 * `Authorization: Bearer` header — so every photo request came back 401
 * and residents saw broken image icons instead of the evidence they
 * attached to a complaint.
 *
 * HOW IT WORKS
 * The API signs each photo path with an HMAC of `<path>.<expiresAt>`,
 * keyed on JWT_SECRET (namespaced so it can never collide with the keys
 * jsonwebtoken uses), and returns:
 *
 *   /api/complaints/<id>/photos/<pid>?exp=<unix>&sig=<hex>
 *
 * The photo route then admits a request when EITHER a valid Bearer
 * token authorises the caller OR the signature matches and has not
 * expired. No token is ever placed in a URL, and a leaked URL stops
 * working once it expires.
 */

import crypto from "crypto";

import config from "./config.js";

/** How long a signed photo URL stays valid (default 7 days). */
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Namespaces the HMAC key so it is never reused for JWT signing. */
const SIGNING_LABEL = "corridor-photo-url-v1";

/** Configured lifetime, overridable with PHOTO_URL_TTL_SECONDS. */
function ttlSeconds() {
  const raw = parseInt(process.env.PHOTO_URL_TTL_SECONDS || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS;
}

/**
 * The HMAC key, derived from JWT_SECRET so no extra secret has to be
 * provisioned. Returns null when no secret is configured, in which case
 * callers fall back to plain (token-only) URLs.
 */
function signingKey() {
  if (!config.jwtSecret) return null;
  return crypto.createHmac("sha256", config.jwtSecret).update(SIGNING_LABEL).digest();
}

/** HMAC-SHA256 of "<path>.<expiresAt>" as lowercase hex. */
function signatureFor(key, path, expiresAt) {
  return crypto
    .createHmac("sha256", key)
    .update(`${path}.${expiresAt}`)
    .digest("hex");
}

/** Compare two hex strings without leaking length/timing information. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Append a signature and expiry to a relative photo path.
 * Returns the path unchanged when no signing key is available or when
 * the path is already signed (so signatures never stack up).
 *
 * @param {string} path e.g. "/api/complaints/abc/photos/def"
 * @returns {string} the path plus "?exp=<unix>&sig=<hex>" (or unchanged)
 */
export function signPhotoPath(path) {
  if (!path || typeof path !== "string") return path;
  if (/[?&]sig=/.test(path)) return path;

  const key = signingKey();
  if (!key) return path;

  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds();
  const sig = signatureFor(key, path, expiresAt);
  return `${path}${path.includes("?") ? "&" : "?"}exp=${expiresAt}&sig=${sig}`;
}

/**
 * Verify a signature on a photo path.
 *
 * @param {string} path the path WITHOUT its query string
 * @param {string|number} exp the "?exp=" value
 * @param {string} sig the "?sig=" value
 * @returns {boolean} true when the signature matches and has not expired
 */
export function verifyPhotoSignature(path, exp, sig) {
  const key = signingKey();
  if (!key || !path || !sig) return false;

  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt)) return false;

  // 60s of clock skew tolerance for multi-instance deployments.
  if (expiresAt < Math.floor(Date.now() / 1000) - 60) return false;

  return safeEqual(signatureFor(key, path, expiresAt), sig);
}
