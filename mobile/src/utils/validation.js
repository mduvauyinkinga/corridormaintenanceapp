/**
 * utils/validation.js
 * ------------------------------------------------------------------
 * Form validation ported 1:1 from the website:
 *   - js/utils.js    → validateRequired, validateEmailDomain
 *   - js/login.js    → email shape regex
 *   - js/register.js → password length + confirmation rules
 *   - js/upload.js   → image type / size rules
 *
 * The mobile app deliberately keeps the SAME rules so a resident cannot
 * create data through the app that the website would have rejected.
 */

import { ALLOWED_DOMAIN } from "../services/api";

/** Simple email shape check (same regex as login.js / register.js). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimum password length enforced by register.html / register.js. */
export const MIN_PASSWORD_LENGTH = 8;

/** Allowed image MIME types (js/upload.js ALLOWED_IMAGE_TYPES). */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Allowed file extensions (js/upload.js ALLOWED_IMAGE_EXT). */
export const ALLOWED_IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];

/** Maximum bytes per photo (js/upload.js MAX_IMAGE_SIZE = 5 MB). */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Maximum length of a shared unit announcement (Starter rules = 500). */
export const MAX_ANNOUNCEMENT_LENGTH = 500;

export function isRequired(value) {
  return Boolean(String(value ?? "").trim());
}

export function validateRequiredMessage(label) {
  return `${label} is required.`;
}

/** Only @tut4life.ac.za addresses may register (server enforces too). */
export function validateEmailDomain(email) {
  const atIndex = String(email || "").indexOf("@");
  if (atIndex === -1) return false;
  const domain = String(email).slice(atIndex);
  return domain.toLowerCase() === ALLOWED_DOMAIN.toLowerCase();
}

/**
 * Validate resident registration fields.
 * Returns an object keyed by field name with error messages ({} = valid).
 */
export function validateRegistration({ fullName, studentNumber, email, password, confirmPassword }) {
  const errors = {};

  if (!isRequired(fullName)) errors.fullName = validateRequiredMessage("Full name");
  if (!isRequired(studentNumber)) errors.studentNumber = validateRequiredMessage("Student number");

  if (!isRequired(email)) {
    errors.email = validateRequiredMessage("Email");
  } else if (!EMAIL_PATTERN.test(String(email).trim())) {
    errors.email = "Please enter a valid email address.";
  } else if (!validateEmailDomain(String(email).trim())) {
    errors.email = `Registration is only allowed with ${ALLOWED_DOMAIN} email addresses.`;
  }

  if (!isRequired(password)) {
    errors.password = validateRequiredMessage("Password");
  } else if (String(password).length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (!isRequired(confirmPassword)) {
    errors.confirmPassword = validateRequiredMessage("Confirm password");
  } else if (confirmPassword !== password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

/** Validate the login form (required + email shape only, like login.js). */
export function validateLogin({ email, password }) {
  const errors = {};
  if (!isRequired(email)) {
    errors.email = validateRequiredMessage("Email");
  } else if (!EMAIL_PATTERN.test(String(email).trim())) {
    errors.email = "Please enter a valid email address.";
  }
  if (!isRequired(password)) errors.password = validateRequiredMessage("Password");
  return errors;
}

/** Validate a complaint form: a category plus at least one issue. */
export function validateComplaint({ category, issues }) {
  const errors = {};
  if (!isRequired(category)) errors.category = "Please select a category.";
  if (!Array.isArray(issues) || issues.length === 0) {
    errors.issues = "Please select at least one issue.";
  }
  return errors;
}

/**
 * Validate an image picked from the device library.
 * Accepts the expo-image-picker asset shape: { uri, fileName, mimeType, fileSize }.
 * Returns an error string or null when acceptable (js/upload.js parity).
 */
export function validateImageAsset(asset) {
  if (!asset || !asset.uri) return "No file selected.";

  const name = asset.fileName || asset.uri.split("/").pop() || "";
  const ext = (name.split(".").pop() || "").toLowerCase();
  const mime = asset.mimeType || "";

  const okType = ALLOWED_IMAGE_TYPES.includes(mime);
  const okExt = ALLOWED_IMAGE_EXT.includes(ext);

  if (!okType && !okExt) {
    return "Only JPG, JPEG, PNG or WEBP images are allowed.";
  }
  if (typeof asset.fileSize === "number" && asset.fileSize > MAX_IMAGE_SIZE) {
    return "Each image must be 5 MB or smaller.";
  }
  return null;
}
