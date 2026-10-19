/**
 * middleware/auth.js
 * ------------------------------------------------------------------
 * JWT authentication + role guards. These replace the checks that
 * firestore.rules used to perform on every request.
 */
import jwt from "jsonwebtoken";
import config from "../config.js";
import { queryRow } from "../db.js";

/**
 * requireAuth: verify the Bearer token and attach the full user row to
 * req.user. Responds 401 when the token is missing/invalid/expired.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "You must be signed in." });
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      const message =
        err.name === "TokenExpiredError"
          ? "Your session has expired. Please sign in again."
          : "Your session is invalid. Please sign in again.";
      return res.status(401).json({ error: message });
    }

    // Load the user so role checks and profile responses are always fresh.
    const user = await queryRow("SELECT * FROM users WHERE id = $1", [payload.sub]);
    if (!user) {
      return res.status(401).json({ error: "This account no longer exists." });
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * optionalAuth: attach req.user when a valid Bearer token is present,
 * but NEVER reject the request. Used by the photo route, which also
 * admits requests carrying a short-lived HMAC signature instead of a
 * token — an `<img>` element or a React Native `<Image>` cannot send an
 * Authorization header, so a hard 401 here would make every complaint
 * photo fail to render (see photoToken.js).
 */
export async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      // An invalid/expired token is not fatal here: the request may still
      // be authorised by a signature, which the controller verifies.
      return next();
    }

    try {
      const user = await queryRow("SELECT * FROM users WHERE id = $1", [payload.sub]);
      if (user) req.user = user;
    } catch (err) {
      /* leave req.user unset and fall through to signature checks */
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * requireRole: after requireAuth, ensure the user has one of the given
 * roles. Responds 403 otherwise.
 *   router.get("/admin", requireAuth, requireRole(["management"]), handler)
 */
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "You must be signed in." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    return next();
  };
}