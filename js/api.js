/**
 * Firebase Auth + Firestore client for the Corridor Maintenance App.
 * Replaces the Express + PostgreSQL backend.
 */
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
const TOKEN_KEY = "corridor_firebase_token";
const USER_KEY = "corridor_firebase_user";

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
export function setSession(idToken, user) {
  localStorage.setItem(TOKEN_KEY, idToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Clear the stored session (logout / invalid token). */
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Error class for Firebase auth/firestore operations. */
export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/**
 * Make a Firestore request.
 * @param {string} collection - Firestore collection name
 * @param {string} method - 'get', 'set', 'update', 'delete'
 * @param {string} docId - Document ID (for set/update/delete operations)
 * @param {object} data - Data to write (for set/update operations)
 * @returns {Promise<object>} the parsed Firestore document data
 */
export async function api(collection, method, docId = null, data = null) {
  // Ensure Firebase is initialized
  if (typeof firebase === 'undefined' || !firebase.firestore) {
    throw new Error("Firebase not initialized. Make sure Firebase SDK scripts are loaded in index.html");
  }

  const db = firebase.firestore();
  const user = firebase.auth().currentUser;
  let token = null;
  
  if (user) {
    try {
      token = await user.getIdToken();
    } catch (e) {
      console.error("Failed to get user token:", e);
    }
  }
  
  let ref = db.collection(collection);
  
  if (method === 'get' && !docId) {
    // Get all documents in collection
    const snapshot = await ref.get();
    const results = [];
    snapshot.forEach(doc => {
      results.push({ id: doc.id, ...doc.data() });
    });
    return results;
  }
  
  if (method === 'get' && docId) {
    // Get single document
    const docSnap = await ref.doc(docId).get();
    if (docSnap.exists) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      return null;
    }
  }
  
  if (method === 'set') {
    if (!docId) throw new Error("Document ID required for set operation");
    if (!token) throw new Error("User must be authenticated for write operations");
    
    // Add timestamp for tracking
    const dataWithTimestamp = {
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await ref.doc(docId).set(dataWithTimestamp, { merge: true });
    return { success: true };
  }
  
  if (method === 'update') {
    if (!docId) throw new Error("Document ID required for update operation");
    if (!token) throw new Error("User must be authenticated for write operations");
    
    const dataWithTimestamp = {
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await ref.doc(docId).update(dataWithTimestamp);
    return { success: true };
  }
  
  if (method === 'delete') {
    if (!docId) throw new Error("Document ID required for delete operation");
    if (!token) throw new Error("User must be authenticated for write operations");
    
    await ref.doc(docId).delete();
    return { success: true };
  }
  
  throw new Error(`Unknown Firestore method: ${method}`);
}

/**
 * Make an API request.
 * @param {string} path - e.g. "/auth/login".
 * @param {{ method?: string, body?: object, auth?: boolean }} options
 * @returns {Promise<object>} the parsed JSON response body.
 */



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

/** Resolve a photo URL - for Firebase Storage URLs, they're already absolute */
export function resolvePhotoURL(url) {
  if (!url) return url;
  // Firebase Storage URLs are already absolute, so they pass through
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  // If it's a relative path, prepend the current origin
  return `${window.location.origin}${url}`;
}