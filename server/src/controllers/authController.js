/**
 * controllers/authController.js
 * ------------------------------------------------------------------
 * Register / login / me / logout handlers.
 *
 * The user object returned to clients uses the exact camelCase field
 * names the web + mobile clients already expect from Firestore
 * (uid, name, studentNumber, email, role, roomId, unitId, ...), so the
 * client-side code barely changes.
 */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "../config.js";
import { query, queryRow } from "../db.js";
import { generateUid } from "../uid.js";
import { sendPasswordResetEmail } from "../email.js";

/** Map a users row (snake_case) to the public camelCase user shape. */
function toPublicUser(row) {
  return {
    uid: row.id,
    name: row.name,
    studentNumber: row.student_number,
    email: row.email,
    role: row.role,
    roomId: row.room_id,
    unitId: row.unit_id,
    roomLetter: row.room_letter,
    block: row.block,
    roomNumber: row.room_number,
    createdAt: row.created_at,
  };
}

/** Sign a JWT for a user row. */
function signToken(row) {
  return jwt.sign({ sub: row.id, role: row.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/** POST /api/auth/register — create a resident account. */
export async function register(req, res, next) {
  try {
    const { fullName, studentNumber, email, password } = req.body || {};
    const name = String(fullName || "").trim();
    const student = String(studentNumber || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const pass = String(password || "");

    // Validation mirrors js/register.js + the firestore.rules create rule.
    if (!name) return res.status(400).json({ error: "Full name is required." });
    if (name.length > 100) {
      return res.status(400).json({ error: "Full name must be 100 characters or fewer." });
    }
    if (!student) return res.status(400).json({ error: "Student number is required." });
    if (student.length > 30 || !/^[A-Za-z0-9-]+$/.test(student)) {
      return res.status(400).json({ error: "Student number may only contain letters, numbers and dashes." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!cleanEmail.endsWith(config.allowedDomain.toLowerCase())) {
      return res
        .status(400)
        .json({ error: `Registration is only allowed with ${config.allowedDomain} email addresses.` });
    }
    // The private management email can never register as a resident —
    // the management account is seeded from server env vars only.
    const managerEmail = (process.env.MANAGER_EMAIL || "").trim().toLowerCase();
    if (managerEmail && cleanEmail === managerEmail) {
      return res.status(403).json({ error: "This email is reserved. Please sign in instead." });
    }
    if (pass.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    // Reject duplicates before attempting the insert.
    const existing = await queryRow("SELECT 1 FROM users WHERE email = $1", [cleanEmail]);
    if (existing) {
      return res.status(409).json({ error: "This email is already registered." });
    }

    const uid = generateUid();
    const passwordHash = await bcrypt.hash(pass, 10);

    const row = await queryRow(
      `INSERT INTO users (id, name, student_number, email, password_hash, role, room_id, unit_id)
       VALUES ($1, $2, $3, $4, $5, 'resident', NULL, NULL)
       RETURNING *`,
      [uid, name, student, cleanEmail, passwordHash]
    );

    const token = signToken(row);
    return res.status(201).json({ token, user: toPublicUser(row) });
  } catch (err) {
    // 23505 = unique_violation (email raced with another registration).
    if (err.code === "23505") {
      return res.status(409).json({ error: "This email is already registered." });
    }
    return next(err);
  }
}

/** POST /api/auth/login — verify email + password. */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    const pass = String(password || "");

    if (!cleanEmail || !pass) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const row = await queryRow("SELECT * FROM users WHERE email = $1", [cleanEmail]);
    // One generic failure for BOTH unknown email and wrong password so
    // attackers cannot use this endpoint to discover which emails exist.
    const invalidCreds = { error: "Incorrect email or password. Please try again." };
    if (!row) {
      return res.status(401).json(invalidCreds);
    }

    const ok = await bcrypt.compare(pass, row.password_hash);
    if (!ok) {
      return res.status(401).json(invalidCreds);
    }

    const token = signToken(row);
    return res.json({ token, user: toPublicUser(row) });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/auth/me — the signed-in user's profile. */
export async function req(req, res) {
  res.json({ user: toPublicUser(req.user) });
}
export { req as me };

/** POST /api/auth/logout — stateless JWT; the client discards the token. */
export async function logout(req, res) {
  res.json({ ok: true });
}

/**
 * POST /api/auth/forgot-password — send a password-reset link by email.
 * Anti-enumeration: always returns the same success shape whether or not
 * the email exists, so attackers cannot probe for registered addresses.
 */
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ error: "Email is required." });
    }

    // Look up the user without revealing whether the email exists.
    const row = await queryRow("SELECT id FROM users WHERE email = $1", [
      cleanEmail,
    ]);
    if (!row) {
      return res.json({
        message:
          "If an account exists for that email, a reset link has been sent.",
      });
    }

    // Invalidate any existing unused tokens for this user.
    await query(
      "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE",
      [row.id]
    );

    // Create a new single-use token valid for 1 hour.
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await queryRow(
      `INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [generateUid(), row.id, token, expiresAt]
    );

    const resetUrl = `${config.frontendUrl}/reset-password.html?token=${token}`;
    await sendPasswordResetEmail(cleanEmail, resetUrl);

    res.json({
      message:
        "If an account exists for that email, a reset link has been sent.",
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/reset-password — set a new password using a reset token.
 * The token is single-use and expires after 1 hour.
 */
export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body || {};
    const pass = String(password || "");

    if (!token) {
      return res.status(400).json({ error: "Reset token is required." });
    }
    if (!pass || pass.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters.",
      });
    }

    const row = await queryRow(
      `SELECT id, user_id, expires_at, used
       FROM password_reset_tokens WHERE token = $1`,
      [token]
    );

    if (!row) {
      return res.status(400).json({
        error: "Invalid or expired reset token.",
      });
    }
    if (row.used) {
      return res.status(400).json({
        error: "This reset link has already been used.",
      });
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({
        error: "This reset link has expired. Please request a new one.",
      });
    }

    const passwordHash = await bcrypt.hash(pass, 10);
    await queryRow("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      row.user_id,
    ]);

    // Mark token as used so it cannot be reused.
    await queryRow(
      "UPDATE password_reset_tokens SET used = TRUE WHERE id = $1",
      [row.id]
    );

    res.json({ message: "Your password has been reset. You can now sign in." });
  } catch (err) {
    return next(err);
  }
}