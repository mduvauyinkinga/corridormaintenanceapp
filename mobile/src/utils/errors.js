/**
 * utils/errors.js
 * ------------------------------------------------------------------
 * Human-readable error messages for the self-coded backend.
 *
 * The API client (services/api.js) throws an `ApiError` whose `message`
 * is already the server's friendly `{ error }` text, so this helper
 * mostly passes that through. It adds fallbacks for connection problems
 * (status 0 / code "unavailable") and a few common HTTP statuses the
 * server may return without a specific message.
 */

const MESSAGES = {
  unavailable: "You appear to be offline. Check your connection and try again.",
  400: "Some of the information entered is not valid. Please review and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to perform this action.",
  404: "The requested record no longer exists.",
  409: "That action conflicts with the current state. Please refresh and try again.",
  429: "Too many attempts. Please try again later.",
  500: "Something went wrong on our side. Please try again.",
};

/** Extract a human-readable message from an API (or plain) error. */
export function getErrorMessage(error) {
  const code = error?.code || "";
  if (MESSAGES[code]) return MESSAGES[code];

  // Connection failures surface as status 0 with a descriptive message.
  if (error?.status === 0) return MESSAGES.unavailable;
  if (MESSAGES[error?.status]) return MESSAGES[error.status];

  if (typeof error?.message === "string" && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

/** True when the error looks like a connectivity problem. */
export function isOfflineError(error) {
  return error?.status === 0 || error?.code === "unavailable";
}
