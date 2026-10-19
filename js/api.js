/**
 * api.js
 * ------------------------------------------------------------------
 * Thin HTTP client for the self-coded backend (replaces the Firebase
 * SDK for auth/data calls).
 *
 * - Stores the login token + cached user in localStorage.
 * - Wraps fetch with JSON parsing, the Authorization header, and
 *   friendly errors (the server returns { error } on failure).
 *
 * For production, set window.__CORRIDOR_API_BASE__ before this module
 * loads (e.g. in index.html) or edit the fallback below.
 */
const API_BASE = (window.__CORRIDOR_API_BASE__ || "http://localhost:4000") + "/api";
const TOKEN_KEY = "corridor_token";
const USER_KEY = "corridor_user";

/** Allowed email domain for resident registration (server enforces too). */
export const ALLOWED_DOMAIN = "@tut4life.ac.za";

/** The stored login token, or null. */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/** The cached user object, or null. */
export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch (e) {
    return null;
  }
}

/** Persist a successful login. */
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Clear the stored session (logout / invalid token). */
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Error carrying the server's HTTP status. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Friendly message when the backend cannot be reached at all. */
export function connectionErrorMessage() {
  return (
    "Cannot reach the server. " +
    "Make sure the backend is running (in server/: npm run dev) " +
    "and API_BASE points at it (default http://localhost:4000)."
  );
}

/**
 * Make an API request.
 * @param {string} path - e.g. "/auth/login".
 * @param {{ method?: string, body?: object, auth?: boolean }} options
 * @returns {Promise<object>} the parsed JSON response body.
 */
export async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // Server down / wrong port / CORS blocked: surface a helpful message
    // instead of the raw "TypeError: Failed to fetch".
    throw new ApiError(connectionErrorMessage(), 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* non-JSON response */
  }
  if (!res.ok) {
    throw new ApiError((data && data.error) || "Something went wrong. Please try again.", res.status);
  }
  return data;
}


/**
 * Resolve a photo URL returned by the backend. The server stores and
 * returns relative paths ("/api/complaints/:id/photos/:pid") so they
 * work on any host — the browser needs the API origin prefixed when the
 * page is not served from the same origin. Absolute URLs pass through.
 */
export function resolvePhotoURL(url) {
  if (!url) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return `${API_BASE.slice(0, -"/api".length)}${url}`;
}
