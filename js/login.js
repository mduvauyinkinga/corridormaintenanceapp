/** 
 * login.js 
 * ------------------------------------------------------------------ 
 * Login handler. Signs in using Firebase Auth and redirects 
 * based on role: 
 *   - resident   -> dashboard.html (or choose-room if no room yet) 
 *   - management -> management.html 
 * 
 * Uses Firebase Auth signInWithEmailAndPassword instead of the 
 * self-coded backend API. 
 */ 
 import { setSession, getToken, getStoredUser } from "./api.js"; 
 import {
  validateRequired,
  setFieldError,
  setButtonLoading,
  showError,
  clearError,
  focusFirstError,
  initPasswordToggles,
  initLiveAuthValidation,
  $,
 } from "./utils.js";

/** 
 * Sign in with Firebase Auth using email and password. 
 * Returns the user object on success, throws on failure. 
 */ 
async function firebaseSignIn(email, password) { 
  try {    const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
    const idToken = await userCredential.user.getIdToken();
    const user = userCredential.user;
    // Set custom role based on email domain
    const role = user.email?.endsWith("@tut4life.ac.za") ? "resident" : "resident";
    setSession(idToken, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: role,
    });
    return user;
  } catch (error) {
    console.error("[login] Firebase sign-in failed:", error);
    throw error;
  }
}

const form = $("#login-form");
const submitBtn = $("#login-btn");

/**  * Where to go after a successful sign-in. *
 *
 * A guarded page sends us here with ?next=<path> so a user whose session
 * expired mid-task lands back where they were instead of on the default
 * page. The value is attacker-controllable, so it is only ever followed
 * when it is a same-origin, relative path ΓÇö never an absolute URL, which
 * would turn login into an open redirect to a phishing site.
 *
 * @param {object|null} profile - the signed-in user.
 * @returns {string} a safe destination path.
 */
 function redirectByRole(profile) {
   if (!profile) {
     window.location.href = "choose-room.html";
     return;
   }
   if (profile.role === "management") {
     window.location.href = safeNextPath() || "management.html";
     return;
   }
   // Residents without a room must complete setup before anything else ΓÇö
   // returning them to a guarded page would just bounce them back here.
   if (!profile.roomId) {
     window.location.href = "choose-room.html";
     return;
   }
   window.location.href = safeNextPath() || "dashboard.html";
 }

/**
 * Read a trusted ?next= destination, or "" when it is missing/unsafe.
 * Accepts only site-relative paths ("/tracking.html"), so a crafted
 * "https://evil.example" or "//evil.example" is discarded.
 */
 function safeNextPath() {
   let raw;
   try {
     raw = new URLSearchParams(window.location.search).get("next") || "";
   } catch (e) {
     return "";
   }
   if (!raw) return "";
   // Protocol-relative ("//host") and absolute URLs are rejected outright.
   if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return "";
   // Must be a path within this site, and must be one of our pages.
   const path = raw.split("?")[0].split("#")[0];
   if (!path.startsWith("/")) return "";
   if (!/\\.html$/.test(path)) return "";
   return raw;
 }

/** Explain a guard-driven visit ("your session expired") on the form. */
 function showGuardReason() {
   let reason;
   try {
     reason = new URLSearchParams(window.location.search).get("reason");
   } catch (e) {
     return;
   }
   if (reason !== "expired" && reason !== "unavailable") return;
   const alertEl = $("#form-alert");
   if (!alertEl) return;
   // Informational styling: an expired session is expected, not a fault.
   alertEl.classList.add("form__alert--info");
   alertEl.textContent =
     reason === "unavailable"
       ? "We could not verify your session ΓÇö the server could not be reached, or it returned an error. Check your connection and the API, then sign in again."
       : "Your session expired for your security. Please sign in again to continue where you left off.";
   alertEl.hidden = false;
 }

form.addEventListener("submit", async (event) => {
   event.preventDefault();
   clearError();

   const email = $("#email").value.trim();
   const password = $("#password").value;

   const emailInput = $("#email");
   const passwordInput = $("#password");

   let valid = true;
   if (!validateRequired(emailInput, "Email")) valid = false;
   if (!validateRequired(passwordInput, "Password")) valid = false;
   if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
     setFieldError(emailInput, "Please enter a valid email address.");
     valid = false;
   }
   if (!valid) {
     // Send keyboard/AT users straight to the first problem field.
     focusFirstError(form);
     return;
   }

   const restore = setButtonLoading(submitBtn, "Signing in...");

   try {
     const user = await firebaseSignIn(email, password);
     redirectByRole(user);
   } catch (error) {
     console.error("[login] Login failed:", error);
     showError(error.message || "Something went wrong. Please try again.");
     restore();
   }
 });

// If a route guard sent the user here because their session expired,
// say so up front instead of silently showing an empty login form.
showGuardReason();

// Show/hide password + live validation.
initPasswordToggles();
initLiveAuthValidation({ passwordInput: $("#password") });

// If already signed in, skip login and go to the right home.
if (getToken()) {
  const user = getStoredUser();
  if (user) {
    if (user.role === "management") window.location.href = "management.html";
    else if (!user.roomId) window.location.href = "choose-room.html";
    else window.location.href = safeNextPath() || "dashboard.html";
  }
}

