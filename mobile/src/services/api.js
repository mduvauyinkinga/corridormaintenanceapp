/**
 * services/api.js
 * ------------------------------------------------------------------
 * Thin HTTP client for the self-coded backend (replaces the Firebase
 * SDK for auth calls in the mobile app). Mirrors js/api.js on the web.
 *
 * - Stores the login token + cached user in AsyncStorage.
 * - Wraps fetch with JSON parsing, the Authorization header, and
 *   friendly errors (the server returns { error } on failure).
 *
 * API_BASE: for the Android emulator use http://10.0.2.2:4000, for a
 * physical device use your machine LAN IP (e.g. http://192.168.x.x:4000).
 * Configured via Expo `extra.apiBaseUrl` (app.config.js) so each
 * environment can override it without editing source:
 *   npx expo start                       -> emulator default (10.0.2.2)
 *   EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:4000 npx expo start
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

let Constants = null;
try {
  Constants = require("expo-constants").default || require("expo-constants");
} catch (e) {
  Constants = null; // expo-constants not installed — env var + default still work.
}

/**
 * Resolve the backend base URL.
 * Priority: EXPO_PUBLIC_API_BASE_URL env -> app.json/app.config extra ->
 * sensible default per platform (Android emulator cannot reach the host
 * machine via "localhost", so it uses the 10.0.2.2 alias).
 */
function resolveApiBase() {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (fromEnv) return `${fromEnv.replace(/\/$/, "")}/api`;
  const fromExtra = Constants?.expoConfig?.extra?.apiBaseUrl;
  if (fromExtra) return `${String(fromExtra).replace(/\/$/, "")}/api`;
  return "http://10.0.2.2:4000/api";
}

const API_BASE = resolveApiBase();
const TOKEN_KEY = "corridor_token";
const USER_KEY = "corridor_user";

/** Exported for diagnostics (connection-error message shows the target). */
export function getApiBase() {
  return API_BASE;
}

/** Allowed email domain for resident registration (server enforces too). */
export const ALLOWED_DOMAIN = "@tut4life.ac.za";

/** The stored login token, or null. */
export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

/** The cached user object, or null. */
export async function getStoredUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** Persist a successful login. */
export async function setSession(token, user) {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [USER_KEY, JSON.stringify(user)],
  ]);
}

/** Clear the stored session (logout / invalid token). */
export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

/** Error carrying the server's HTTP status (and an optional code). */
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
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
    const token = await getToken();
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
    // Emulator localhost pitfall: log the target so the fix is obvious.
    throw new ApiError(
      `Cannot reach the server at ${API_BASE}. ` +
        "Start the backend (server/: npm run dev); on an emulator use " +
        "http://10.0.2.2:4000, on a physical device use your PC's LAN IP " +
        "(EXPO_PUBLIC_API_BASE_URL).",
      0,
      "unavailable"
    );
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* non-JSON response */
  }
  if (!res.ok) {
    throw new ApiError(
      (data && data.error) || "Something went wrong. Please try again.",
      res.status
    );
  }
  return data;
}

/**
 * Resolve a photo URL returned by the backend. The server stores and
 * returns relative paths ("/api/complaints/:id/photos/:pid") so they
 * work on any host — React Native images need the API origin prefixed.
 * Absolute URLs (http:, data:) pass through unchanged.
 * Web equivalent: resolvePhotoURL in js/api.js.
 */
export function resolvePhotoURL(url) {
  if (!url) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return `${API_BASE.slice(0, -"/api".length)}${url}`;
}