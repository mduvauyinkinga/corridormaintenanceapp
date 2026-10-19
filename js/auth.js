/**
 * auth.js
 * ------------------------------------------------------------------
 * Route guarding + role helpers built on top of our self-coded backend
 * (replaces the Firebase Auth + Firestore profile lookups).
 * Exported names/signatures match the old Firebase version so the rest
 * of the app keeps working unchanged.
 */
import { api, getToken, getStoredUser, clearSession } from "./api.js";

/**
 * Build the login URL that brings the user back to where they were.
 *
 * Why: a JWT lasts 7 days. When it expires mid-task (half-way through a
 * complaint, say) the guard used to bounce the user to a bare login page
 * and their place was lost with no explanation. We now carry the current
 * path back so login can return them to it, plus a `reason` so login can
 * say WHY they were sent there.
 *
 * @param {"expired"|"invalid"|null} reason - why the redirect happened.
 * @returns {string} e.g. "login.html?next=%2Ftracking.html&reason=expired"
 */
function loginRedirectURL(reason) {
  const params = new URLSearchParams();
  // Absolute path on this origin, so it works from any page and any
  // sub-path deployment. Query string included so filters survive.
  const next = window.location.pathname + window.location.search;
  if (next) params.set("next", next);
  if (reason) params.set("reason", reason);
  const qs = params.toString();
  return `login.html${qs ? `?${qs}` : ""}`;
}

/** Resolve the signed-in user (cached) or null. */
export async function getCurrentUser() {
  if (!getToken()) return null;
  return getStoredUser();
}

/** Fetch the signed-in user's profile via GET /auth/me (or null). */
export async function getUserProfile() {
  if (!getToken()) return null;
  try {
    const data = await api("/auth/me", { auth: true });
    return data.user || null;
  } catch (error) {
    if (error.status === 401) {
      clearSession();
      return null;
    }
    throw error;
  }
}

/** Route guard: ensure the user is signed in. Redirects to login. */
export async function requireAuth() {
  if (!getToken()) {
    // No session at all — a plain "please sign in" trip.
    window.location.href = loginRedirectURL(null);
    return null;
  }
  let profile;
  try {
    profile = await getUserProfile();
  } catch (error) {
    // The session could not be VERIFIED at all (API unreachable, CORS
    // blocked, 5xx). getUserProfile() only converts 401 into null, so any
    // other failure used to escape this guard as a rejected promise. Page
    // init() calls had no .catch(), so nothing redirected and the guarded
    // dashboard stayed on screen with no data and no explanation — i.e.
    // the route guard silently stopped working. An unverifiable session
    // must behave exactly like no session: leave the page.
    console.error("[auth] could not verify session:", error);
    window.location.href = loginRedirectURL("unavailable");
    return null;
  }
  if (!profile) {
    // A token existed but the server rejected it (expired after 7 days,
    // or the account changed role/vanished). Say so on the login page.
    // NOTE: getUserProfile() has already cleared the session on a 401, so
    // we cannot re-test getToken() here — we knew it existed above.
    window.location.href = loginRedirectURL("expired");
    return null;
  }
  return profile;
}

/** Route guard: ensure the user has one of the allowed roles. */
export async function requireRole(allowedRoles) {
  const profile = await requireAuth();
  if (!profile) return null;
  if (!allowedRoles.includes(profile.role)) {
    window.location.href = profile.role === "management" ? "management.html" : "choose-room.html";
    return null;
  }
  // A resident must have a room before using resident pages.
  if (profile.role === "resident" && !profile.roomId) {
    window.location.href = "choose-room.html";
    return null;
  }
  return profile;
}

/** Sign out: clear the stored session and go home. */
export async function logout() {
  try {
    clearSession();
  } catch (e) {
    /* ignore */
  }
  window.location.href = "index.html";
}

/**
 * Decode the expiry claim from our own JWT without verifying it.
 *
 * Safe to do client-side: this is only used to decide whether to WARN
 * the user that their session is nearly over. The server re-verifies
 * every token, so a tampered exp here cannot grant any access — the
 * worst case is a spurious or missing warning banner.
 *
 * @returns {number|null} exp in ms since epoch, or null when unknown.
 */
function tokenExpiryMs() {
  const token = getToken();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    // base64url -> JSON. atob is fine for ASCII JSON payloads.
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

/**
 * Warn once per page load when the session is close to expiring.
 *
 * Tokens last 7 days, so an expiry normally arrives silently — often
 * mid-form, losing whatever the user had typed. This turns that into an
 * advance notice. Default window: 24 hours.
 *
 * @param {{ toast: Function }} utils - the toast helper from utils.js.
 * @param {number} [windowMs] - how far ahead to warn (default 24h).
 */
export function warnIfSessionExpiring(utils, windowMs = 24 * 60 * 60 * 1000) {
  const exp = tokenExpiryMs();
  if (!exp) return;
  const remaining = exp - Date.now();
  if (remaining <= 0 || remaining > windowMs) return;

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.max(1, Math.round(remaining / (60 * 60 * 1000)));
  const when = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${hours} hour${hours === 1 ? "" : "s"}`;
  utils.toast(
    `Your session expires in ${when}. Please save your work and sign in again soon.`,
    "warning",
    8000
  );
}