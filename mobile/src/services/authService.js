/**
 * services/authService.js
 * ------------------------------------------------------------------
 * Authentication against the self-coded backend (replaces Firebase
 * Auth). Keeps the SAME exported names/signatures the AuthContext and
 * screens already use, so nothing else changes:
 *   subscribeToAuthState, getCurrentUser, getUserProfile, signIn,
 *   registerResident, signOutUser.
 *
 * NOTE: all mobile data access (rooms, complaints, notes, timeline,
 * announcements, management) runs on this same backend — there is no
 * separate Firebase SDK anywhere in the app.
 */
import { api, clearSession, getToken, setSession } from "./api";

let listeners = [];
let cachedUser = null;

/** Load the current user from the stored token via GET /auth/me. */
async function loadSession() {
  const token = await getToken();
  if (!token) {
    cachedUser = null;
    return null;
  }
  try {
    const data = await api("/auth/me", { auth: true });
    cachedUser = data.user || null;
    return cachedUser;
  } catch (error) {
    if (error.status === 401) {
      await clearSession();
      cachedUser = null;
      return null;
    }
    throw error;
  }
}

function notify() {
  listeners.slice().forEach((cb) => {
    try {
      cb(cachedUser);
    } catch (e) {
      /* ignore */
    }
  });
}

/**
 * Subscribe to auth state changes (fires immediately with the resolved
 * user or null, then on every sign-in / sign-out). Returns an unsubscribe
 * function. Mirrors the website's session guard on app start.
 */
export function subscribeToAuthState(callback) {
  listeners.push(callback);
  loadSession()
    .then((user) => callback(user))
    .catch(() => callback(null));
  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}

/** The currently signed-in user (cached), or null. */
export function getCurrentUser() {
  return cachedUser;
}

/**
 * Fetch the signed-in user profile (the user object itself). The uid param
 * is accepted for signature parity but ignored (the server derives it from
 * the token). Returns null when signed out.
 */
export async function getUserProfile(uid) {
  return loadSession();
}

/**
 * Sign in with email + password and load the profile.
 * Returns { user, profile } (profile may be null until a room is chosen).
 */
export async function signIn(email, password) {
  const data = await api("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  await setSession(data.token, data.user);
  cachedUser = data.user;
  notify();
  return { user: data.user, profile: data.user };
}

/**
 * Create a resident account, then sign them in (store the session).
 * Returns the new uid.
 */
export async function registerResident({ fullName, studentNumber, email, password }) {
  const data = await api("/auth/register", {
    method: "POST",
    body: { fullName, studentNumber, email, password },
    auth: false,
  });
  await setSession(data.token, data.user);
  cachedUser = data.user;
  notify();
  return data.user.uid;
}

/**
 * Sign out (js/auth.js logout). Clears the stored token, drops the cached
 * user and notifies listeners so the navigator routes back to Login. The
 * server-side logout endpoint is called best-effort — a failure here must
 * not block the local sign-out.
 */
export async function signOutUser() {
  try {
    await api("/auth/logout", { method: "POST", auth: true });
  } catch (error) {
    /* ignore: local sign-out must always succeed */
  }
  await clearSession();
  cachedUser = null;
  notify();
}