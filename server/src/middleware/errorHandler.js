/**
 * middleware/errorHandler.js - central error handling.
 * Any route that calls next(err) lands here.
 */

/** 404 for unknown API routes. */
export function notFound(req, res) {
  res.status(404).json({ error: "Not found." });
}

/** Final error responder - never leaks a stack trace to the client. */
export function errorHandler(err, req, res, next) {
  console.error("[error]", err);
  const status = err.status || 500;
  // Only deliberate 4xx errors carry a message meant for users. Anything
  // unexpected (500) returns a generic message so internal details
  // (SQL text, driver messages, file paths) never reach the client.
  const message =
    status >= 400 && status < 500 && err.message
      ? err.message
      : "Something went wrong. Please try again.";
  res.status(status).json({ error: message });
}