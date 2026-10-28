/**
 * controllers/complaintsController.js
 * ------------------------------------------------------------------
 * Complaint CRUD + timeline + notes + photos.
 *
 * Mirrors the Firestore operations in js/complaints.js, js/tracking.js,
 * js/dashboard.js and js/management.js:
 *   list    <- complaints where residentId == uid orderBy createdAt desc
 *              (?scope=unit also returns the reports of unit mates)
 *   create  <- addDoc(complaints) + initial timeline event
 *   edit    <- updateDoc(category/issues/notes) when Submitted/Received
 *   cancel  <- updateDoc(status = Cancelled) when Submitted/Received
 *   reopen  <- updateDoc(reopenRequested/reopenStatus)
 *   notes   <- complaints/{id}/maintenanceNotes subcollection
 *   timeline<- complaints/{id}/timeline subcollection
 *   photos  <- complaint_photos BYTEA (free, no Firebase Storage)
 */

import { queryRows, queryRow, getClient } from "../db.js";
import { signPhotoPath, verifyPhotoSignature } from "../photoToken.js";
import { generateId } from "../uid.js";

const RESIDENT_EDITABLE = ["Submitted", "Received"];
const COMPLAINT_STATUSES = [
  "Submitted",
  "Received",
  "Assigned",
  "In Progress",
  "Waiting for Parts",
  "Completed",
  "Cancelled",
];
const PRIORITIES = ["Low", "Medium", "High", "Emergency"];
const ALLOWED_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 1500000; // ~1.5MB decoded per photo (post-compression)

/* Field length caps — keep requests small and rows predictable. */
const MAX_CATEGORY_LEN = 50;
const MAX_ISSUES = 20;
const MAX_ISSUE_LEN = 100;
const MAX_NOTES_LEN = 2000;
const MAX_NOTE_LEN = 2000;

/**
 * Validate category/issues/notes fields shared by create + edit.
 * Returns an error message string, or null when everything is valid.
 */
function validateComplaintFields({ category, issues, notes }) {
  if (category != null) {
    if (typeof category !== "string" || !category.trim()) {
      return "Please select a category.";
    }
    if (category.length > MAX_CATEGORY_LEN) {
      return `Category must be ${MAX_CATEGORY_LEN} characters or fewer.`;
    }
  }
  if (issues != null) {
    if (!Array.isArray(issues) || issues.length === 0) {
      return "Please select at least one issue.";
    }
    if (issues.length > MAX_ISSUES) {
      return `You can select up to ${MAX_ISSUES} issues.`;
    }
    if (issues.some((i) => String(i).length > MAX_ISSUE_LEN)) {
      return `Each issue must be ${MAX_ISSUE_LEN} characters or fewer.`;
    }
  }
  if (notes != null && String(notes).length > MAX_NOTES_LEN) {
    return `Notes must be ${MAX_NOTES_LEN} characters or fewer.`;
  }
  return null;
}

/**
 * Map a complaints row (snake_case) to the camelCase shape clients use.
 *
 * photoURLs are signed here so `<img src>` / `<Image source>` can fetch
 * them without an Authorization header (see photoToken.js). The stored
 * paths stay unsigned in the database — signing happens per response.
 */
export function toPublicComplaint(row) {
  if (!row) return null;
  return {
    id: row.id,
    residentId: row.resident_id,
    residentName: row.resident_name || null,
    roomId: row.room_id,
    unitId: row.unit_id,
    issues: Array.isArray(row.issues) ? row.issues : [],
    category: row.category,
    priority: row.priority,
    notes: row.notes,
    status: row.status,
    reopenRequested: row.reopen_requested,
    reopenStatus: row.reopen_status,
    archived: Boolean(row.archived),
    archivedAt: row.archived_at || null,
    photoURLs: Array.isArray(row.photo_urls) ? row.photo_urls.map(signPhotoPath) : [],
    estimatedCompletion: row.estimated_completion,
    actualCompletion: row.actual_completion,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicTimeline(row) {
  return {
    id: row.id,
    action: row.action,
    description: row.description,
    authorId: row.author_id,
    authorName: row.author_name,
    authorRole: row.author_role,
    createdAt: row.created_at,
  };
}

function toPublicNote(row) {
  return {
    id: row.id,
    text: row.text,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: row.created_at,
  };
}

/**
 * Room letter ("A" | "B" | "C") encoded in a bed-slot id such as
 * "A101-A-2" -> "A". Returns null when the id has no letter segment.
 */
function letterFromUnitId(unitId) {
  if (typeof unitId !== "string") return null;
  const parts = unitId.split("-");
  return parts.length >= 3 && parts[1] ? parts[1] : null;
}

/**
 * The unit the signed-in resident belongs to: the parent room plus the
 * lettered sub-room whose two beds are shared by unit mates.
 * Returns { roomId, letter } or null when no bed has been claimed.
 */
async function residentUnitScope(user) {
  if (!user || user.role === "management") return null;
  const roomId = user.room_id || null;
  if (!roomId) return null;
  let letter = user.room_letter || letterFromUnitId(user.unit_id);
  if (!letter && user.unit_id) {
    const unit = await queryRow("SELECT room_letter FROM units WHERE id = $1", [user.unit_id]);
    letter = unit?.room_letter || null;
  }
  return letter ? { roomId, letter } : null;
}

/**
 * The lettered sub-room a complaint belongs to, derived from its bed-slot
 * id, falling back to the units table for ids we cannot parse.
 */
async function complaintUnitLetter(complaint) {
  if (!complaint || !complaint.unit_id) return null;
  const parsed = letterFromUnitId(complaint.unit_id);
  if (parsed) return parsed;
  const unit = await queryRow("SELECT room_letter FROM units WHERE id = $1", [complaint.unit_id]);
  return unit?.room_letter || null;
}

/**
 * True when the requester may VIEW this complaint: management, the
 * resident who filed it, or a unit mate (same room + same lettered unit).
 * Unit mates share the same facilities, so they must be able to see what
 * the other bed has already reported instead of filing it twice.
 */
async function canAccessComplaint(req, complaint) {
  if (!complaint) return false;
  if (req.user.role === "management") return true;
  if (complaint.resident_id === req.user.id) return true;
  const scope = await residentUnitScope(req.user);
  if (!scope || complaint.room_id !== scope.roomId) return false;
  return (await complaintUnitLetter(complaint)) === scope.letter;
}

/**
 * True when the requester may CHANGE this complaint (edit / cancel /
 * reopen). Unit mates may read each other's reports, but only the
 * resident who filed one — or management — may modify it.
 */
function ownsComplaint(req, complaint) {
  if (!complaint) return false;
  if (req.user.role === "management") return true;
  return complaint.resident_id === req.user.id;
}

/** Parse a data-URL (or raw base64) into { mimeType, bytes }. */
function parsePhotoInput(input) {
  if (typeof input === "string") {
    const m = input.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
    if (m) return { mimeType: m[1].toLowerCase(), base64: m[2] };
    return { mimeType: null, base64: input };
  }
  if (input && typeof input === "object") {
    return {
      mimeType: String(input.mimeType || input.mime_type || "").toLowerCase() || null,
      base64: String(input.data || input.base64 || ""),
    };
  }
  return { mimeType: null, base64: "" };
}

/* ------------------------------ List / read ------------------------------ */

/**
 * GET /api/complaints?residentId=:uid[&scope=unit]
 * Management gets all. Residents get their own reports — and, when
 * scope=unit, also the reports filed by their unit mates (same room,
 * same lettered unit) so nobody has to report the same fault twice.
 * Newest first in every case.
 */
export async function listComplaints(req, res, next) {
  try {
    const { residentId, includeArchived, scope } = req.query;
    const showArchived = String(includeArchived || "").toLowerCase() === "true";
    // Management hides archived rows by default (?includeArchived=true to see them).
    // Residents always see their own full history.
    const archiveClause = (alias = "c.") =>
      showArchived || req.user.role !== "management"
        ? ""
        : ` AND COALESCE(${alias}archived, FALSE) = FALSE`;

    // Every list row carries the reporter's name so unit mates can see
    // who filed what (and residents still see "You" in the UI).
    const SELECT_WITH_REPORTER = `SELECT c.*, reporter.name AS resident_name
       FROM complaints c
       LEFT JOIN users reporter ON reporter.id = c.resident_id`;

    let rows;
    if (req.user.role === "management") {
      if (residentId) {
        rows = await queryRows(
          `${SELECT_WITH_REPORTER} WHERE c.resident_id = $1${archiveClause()} ORDER BY c.created_at DESC`,
          [residentId]
        );
      } else {
        rows = await queryRows(
          `${SELECT_WITH_REPORTER} WHERE TRUE${archiveClause()} ORDER BY c.created_at DESC`
        );
      }
    } else {
      const wantsUnitMates = String(scope || "").toLowerCase() === "unit";
      const unitScope = wantsUnitMates ? await residentUnitScope(req.user) : null;
      if (unitScope) {
        // Own reports + every report from the other bed of the same unit.
        // The bed-slot id ("A101-A-2") carries the letter, so the prefix
        // match works with or without a seeded units row.
        rows = await queryRows(
          `${SELECT_WITH_REPORTER}
             LEFT JOIN units bed ON bed.id = c.unit_id
            WHERE c.resident_id = $1
               OR (c.room_id = $2
                   AND (bed.room_letter = $3 OR c.unit_id LIKE $4))
            ORDER BY c.created_at DESC`,
          [req.user.id, unitScope.roomId, unitScope.letter, `${unitScope.roomId}-${unitScope.letter}-%`]
        );
      } else {
        // Residents can only ever see their own complaints.
        rows = await queryRows(
          `${SELECT_WITH_REPORTER} WHERE c.resident_id = $1 ORDER BY c.created_at DESC`,
          [req.user.id]
        );
      }
    }
    res.json({ complaints: rows.map(toPublicComplaint) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/complaints/:id — single complaint (owner, unit mate or management). */
export async function getComplaint(req, res, next) {
  try {
    const row = await queryRow(
      `SELECT c.*, reporter.name AS resident_name
         FROM complaints c
         LEFT JOIN users reporter ON reporter.id = c.resident_id
        WHERE c.id = $1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: "Complaint not found." });
    if (!(await canAccessComplaint(req, row))) {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    res.json({ complaint: toPublicComplaint(row) });
  } catch (err) {
    next(err);
  }
}

/* -------------------------------- Create -------------------------------- */

/**
 * POST /api/complaints
 * Body: { category, issues[], notes?, photos?[] }
 * photos: array of data-URLs (browser-compressed) or { mimeType, data }.
 * Creates the complaint (Submitted/Low), stores photo bytes, writes the
 * initial "Complaint Submitted" timeline event, and returns photo URLs
 * pointing at GET /photos/:photoId.
 */
export async function createComplaint(req, res, next) {
  try {
    const { category, issues, notes, photos } = req.body || {};

    const fieldError = validateComplaintFields({ category, issues, notes });
    if (fieldError) {
      return res.status(400).json({ error: fieldError });
    }
    const photoInputs = photos == null ? [] : Array.isArray(photos) ? photos : [photos];
    if (photoInputs.length > MAX_PHOTOS) {
      return res.status(400).json({ error: `You can attach up to ${MAX_PHOTOS} photos.` });
    }

    const user = await queryRow("SELECT * FROM users WHERE id = $1", [req.user.id]);
    if (user && user.role === "resident" && !user.room_id) {
      return res.status(400).json({ error: "You must choose a room before submitting a complaint." });
    }

    const complaintId = generateId();
    const client = await getClient();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO complaints
           (id, resident_id, room_id, unit_id, issues, category, priority, notes, status, photo_urls)
         VALUES ($1, $2, $3, $4, $5, $6, 'Low', $7, 'Submitted', '{}')`,
        [
          complaintId,
          req.user.id,
          user?.room_id || null,
          user?.unit_id || null,
          issues.map(String),
          String(category),
          String(notes || ""),
        ]
      );

      // Store photo bytes + build serving URLs for the response.
      const photoURLs = [];
      for (const input of photoInputs) {
        const { mimeType, base64 } = parsePhotoInput(input);
        let bytes;
        try {
          bytes = Buffer.from(base64 || "", "base64");
        } catch (e) {
          bytes = Buffer.alloc(0);
        }
        if (!bytes.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "One of the photos could not be read." });
        }
        if (bytes.length > MAX_PHOTO_BYTES) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Each photo must be smaller after compression." });
        }
        let mime = (mimeType || "").toLowerCase();
        if (!mime) {
          mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg"
            : bytes[0] === 0x89 ? "image/png"
            : "image/jpeg";
        }
        if (!ALLOWED_PHOTO_MIME.includes(mime)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Only JPG, PNG or WEBP photos are allowed." });
        }
        const photoId = generateId();
        await client.query(
          "INSERT INTO complaint_photos (id, complaint_id, mime_type, data) VALUES ($1, $2, $3, $4)",
          [photoId, complaintId, mime, bytes]
        );
        photoURLs.push(`/api/complaints/${complaintId}/photos/${photoId}`);
      }
      if (photoURLs.length) {
        await client.query("UPDATE complaints SET photo_urls = $1 WHERE id = $2", [photoURLs, complaintId]);
      }

      await client.query(
        `INSERT INTO timeline_events
           (id, complaint_id, action, description, author_id, author_name, author_role)
         VALUES ($1, $2, 'Complaint Submitted', $3, $4, $5, 'resident')`,
        [
          generateId(),
          complaintId,
          `Category: ${category}. Issues: ${issues.join(", ")}`,
          req.user.id,
          user?.name || "Resident",
        ]
      );

      await client.query("COMMIT");
      const row = await queryRow("SELECT * FROM complaints WHERE id = $1", [complaintId]);
      return res.status(201).json({ complaint: toPublicComplaint(row) });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

/* ------------------------- Resident edit/cancel/reopen ------------------------- */

/**
 * Load a complaint or send 404/403. Returns the row or null (responded).
 * Unit mates may VIEW each other's reports (canAccessComplaint), but only
 * the resident who filed one — or management — may change it.
 */
async function loadOwnedForResident(req, res, id) {
  const row = await queryRow("SELECT * FROM complaints WHERE id = $1", [id]);
  if (!row) {
    res.status(404).json({ error: "Complaint not found." });
    return null;
  }
  if (!ownsComplaint(req, row)) {
    res.status(403).json({ error: "You do not have permission to do that." });
    return null;
  }
  return row;
}

async function addEvent(complaintId, { action, description, authorId, authorName, authorRole }, client) {
  const q = client
    ? (text, params) => client.query(text, params)
    : (text, params) => queryRows(text, params);
  await q(
    `INSERT INTO timeline_events
       (id, complaint_id, action, description, author_id, author_name, author_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [generateId(), complaintId, action || "Update", description || "", authorId || null, authorName || "System", authorRole || null]
  );
}

/**
 * PATCH /api/complaints/:id (resident)
 * Body may contain { category, issues, notes } — only when Submitted/Received.
 */
export async function editComplaint(req, res, next) {
  try {
    const row = await loadOwnedForResident(req, res, req.params.id);
    if (!row) return;
    if (!RESIDENT_EDITABLE.includes(row.status)) {
      return res.status(400).json({ error: "This complaint can no longer be edited." });
    }
    const { category, issues, notes } = req.body || {};
    const fieldError = validateComplaintFields({ category, issues, notes });
    if (fieldError) {
      return res.status(400).json({ error: fieldError });
    }
    const updated = await queryRow(
      `UPDATE complaints SET
         category = COALESCE($1, category),
         issues = COALESCE($2, issues),
         notes = COALESCE($3, notes),
         updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [
        category != null ? String(category) : null,
        issues != null ? issues.map(String) : null,
        notes != null ? String(notes) : null,
        row.id,
      ]
    );
    const profile = await queryRow("SELECT name FROM users WHERE id = $1", [req.user.id]);
    await addEvent(row.id, {
      action: "Complaint Edited",
      description: `Category: ${updated.category}. Issues: ${(updated.issues || []).join(", ")}`,
      authorId: req.user.id,
      authorName: profile?.name || "Resident",
      authorRole: "resident",
    });
    res.json({ complaint: toPublicComplaint(updated) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/complaints/:id/cancel — resident, only Submitted/Received. */
export async function cancelComplaint(req, res, next) {
  try {
    const row = await loadOwnedForResident(req, res, req.params.id);
    if (!row) return;
    if (!RESIDENT_EDITABLE.includes(row.status)) {
      return res.status(400).json({ error: "This complaint can no longer be cancelled." });
    }
    const updated = await queryRow(
      "UPDATE complaints SET status = 'Cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
      [row.id]
    );
    const profile = await queryRow("SELECT name FROM users WHERE id = $1", [req.user.id]);
    await addEvent(row.id, {
      action: "Complaint Cancelled",
      description: "The resident cancelled this complaint.",
      authorId: req.user.id,
      authorName: profile?.name || "Resident",
      authorRole: "resident",
    });
    res.json({ complaint: toPublicComplaint(updated) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/complaints/:id/reopen — resident requests review of Completed. */
export async function requestReopen(req, res, next) {
  try {
    const row = await loadOwnedForResident(req, res, req.params.id);
    if (!row) return;
    if (row.status !== "Completed") {
      return res.status(400).json({ error: "Only completed complaints can be reopened." });
    }
    if (row.reopen_requested) {
      return res.status(400).json({ error: "A reopen request is already waiting for review." });
    }
    const updated = await queryRow(
      `UPDATE complaints SET reopen_requested = TRUE, reopen_status = 'Pending',
         updated_at = NOW() WHERE id = $1 RETURNING *`,
      [row.id]
    );
    res.json({ complaint: toPublicComplaint(updated) });
  } catch (err) {
    next(err);
  }
}

/* ------------------------------ Timeline -------------------------------- */

/** GET /api/complaints/:id/timeline — oldest first (mirrors loadTimeline). */
export async function listTimeline(req, res, next) {
  try {
    const row = await queryRow("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Complaint not found." });
    if (!(await canAccessComplaint(req, row))) {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    const rows = await queryRows(
      "SELECT * FROM timeline_events WHERE complaint_id = $1 ORDER BY created_at ASC",
      [row.id]
    );
    res.json({ events: rows.map(toPublicTimeline) });
  } catch (err) {
    next(err);
  }
}

/* -------------------------------- Notes --------------------------------- */

/** GET /api/complaints/:id/notes — oldest first (mirrors loadNotes). */
export async function listNotes(req, res, next) {
  try {
    const row = await queryRow("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Complaint not found." });
    if (!(await canAccessComplaint(req, row))) {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    const rows = await queryRows(
      "SELECT * FROM maintenance_notes WHERE complaint_id = $1 ORDER BY created_at ASC",
      [row.id]
    );
    res.json({ notes: rows.map(toPublicNote) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/complaints/:id/notes — management only. */
export async function addNote(req, res, next) {
  try {
    if (req.user.role !== "management") {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    const row = await queryRow("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Complaint not found." });
    const { text } = req.body || {};
    if (!text || String(text).trim() === "") {
      return res.status(400).json({ error: "Note text is required." });
    }
    if (String(text).length > MAX_NOTE_LEN) {
      return res.status(400).json({ error: `Note must be ${MAX_NOTE_LEN} characters or fewer.` });
    }
    const profile = await queryRow("SELECT name FROM users WHERE id = $1", [req.user.id]);
    const note = await queryRow(
      `INSERT INTO maintenance_notes (id, complaint_id, text, author_id, author_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [generateId(), row.id, String(text).trim(), req.user.id, profile?.name || "Management"]
    );
    res.status(201).json({ note: toPublicNote(note) });
  } catch (err) {
    next(err);
  }
}

/* -------------------------------- Photos --------------------------------- */

/**
 * GET /api/complaints/:id/photos/:photoId — stream stored bytes.
 *
 * Authorised by EITHER a valid Bearer token (an owner or management)
 * OR a short-lived HMAC signature on the path. The signature path exists
 * because `<img src>` / `<Image source>` cannot send an Authorization
 * header — without it every complaint photo would 401. photoURLs handed
 * out by toPublicComplaint already carry ?exp&sig.
 */
export async function getPhoto(req, res, next) {
  try {
    const complaint = await queryRow("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!complaint) return res.status(404).json({ error: "Complaint not found." });

    // The signature covers the path WITHOUT the query string, so rebuild
    // it from the route params rather than trusting req.path.
    const signedPath = `/api/complaints/${req.params.id}/photos/${req.params.photoId}`;
    const signatureOk = verifyPhotoSignature(
      signedPath,
      req.query.exp,
      req.query.sig
    );

    // A token, when present, must still pass the normal ownership check.
    // Absent a token, a valid signature is sufficient on its own.
    const tokenOk = req.user ? await canAccessComplaint(req, complaint) : false;
    if (!tokenOk && !signatureOk) {
      // 401 when unauthenticated, 403 when authenticated but not the owner.
      return res.status(req.user ? 403 : 401).json({
        error: req.user
          ? "You do not have permission to do that."
          : "You must be signed in.",
      });
    }

    const photo = await queryRow(
      "SELECT mime_type, data FROM complaint_photos WHERE id = $1 AND complaint_id = $2",
      [req.params.photoId, complaint.id]
    );
    if (!photo) return res.status(404).json({ error: "Photo not found." });
    // BYTEA arrives as a Buffer from `pg` but as a Uint8Array from PGlite.
    // res.send() JSON-encodes anything that is not a Buffer, which would
    // corrupt every photo on the pglite driver — so normalise explicitly.
    res.setHeader("Content-Type", photo.mime_type || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(Buffer.from(photo.data));
  } catch (err) {
    next(err);
  }
}

/* ------------------------------- Management ------------------------------ */

/**
 * PATCH /api/complaints/:id/status — management only.
 * Body: { status } — must be a valid workflow status.
 */
export async function updateStatus(req, res, next) {
  try {
    if (req.user.role !== "management") {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    const { status } = req.body || {};
    if (!COMPLAINT_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    const row = await queryRow("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Complaint not found." });
    const updated = await queryRow(
      "UPDATE complaints SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, row.id]
    );
    const profile = await queryRow("SELECT name FROM users WHERE id = $1", [req.user.id]);
    await addEvent(row.id, {
      action: `Status set to ${status}`,
      description: `Management updated the complaint status to "${status}".`,
      authorId: req.user.id,
      authorName: profile?.name || "Management",
      authorRole: "management",
    });
    res.json({ complaint: toPublicComplaint(updated) });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/complaints/:id/priority — management only.
 * Body: { priority } — Low/Medium/High/Emergency.
 */
export async function updatePriority(req, res, next) {
  try {
    if (req.user.role !== "management") {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    const { priority } = req.body || {};
    if (!PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: "Invalid priority." });
    }
    const row = await queryRow("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Complaint not found." });
    const updated = await queryRow(
      "UPDATE complaints SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [priority, row.id]
    );
    const profile = await queryRow("SELECT name FROM users WHERE id = $1", [req.user.id]);
    await addEvent(row.id, {
      action: `Priority set to ${priority}`,
      description: `Management assigned a "${priority}" priority.`,
      authorId: req.user.id,
      authorName: profile?.name || "Management",
      authorRole: "management",
    });
    res.json({ complaint: toPublicComplaint(updated) });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/complaints/:id/dates — management only.
 * Body: { estimatedCompletion?, actualCompletion? } (YYYY-MM-DD or null).
 */
export async function updateDates(req, res, next) {
  try {
    if (req.user.role !== "management") {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    const row = await queryRow("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Complaint not found." });
    const { estimatedCompletion, actualCompletion } = req.body || {};
    const norm = (v) => {
      if (v == null || v === "") return null;
      const d = new Date(`${v}T00:00:00`);
      return Number.isNaN(d.getTime()) ? "invalid" : v;
    };
    const est = norm(estimatedCompletion);
    const act = norm(actualCompletion);
    if (est === "invalid" || act === "invalid") {
      return res.status(400).json({ error: "Dates must be YYYY-MM-DD." });
    }
    const updated = await queryRow(
      `UPDATE complaints SET
         estimated_completion = COALESCE($1, estimated_completion),
         actual_completion = COALESCE($2, actual_completion),
         updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [est, act, row.id]
    );
    const profile = await queryRow("SELECT name FROM users WHERE id = $1", [req.user.id]);
    if (est) {
      await addEvent(row.id, {
        action: "Estimated completion set",
        description: `Management estimated completion by ${est}.`,
        authorId: req.user.id,
        authorName: profile?.name || "Management",
        authorRole: "management",
      });
    }
    if (act) {
      await addEvent(row.id, {
        action: "Actual completion recorded",
        description: `Management recorded actual completion on ${act}.`,
        authorId: req.user.id,
        authorName: profile?.name || "Management",
        authorRole: "management",
      });
    }
    res.json({ complaint: toPublicComplaint(updated) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/complaints/:id/reopen-decision — management only.
 * Body: { approve: boolean }. Approve -> In Progress; reject stays Completed.
 */
export async function decideReopen(req, res, next) {
  try {
    if (req.user.role !== "management") {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
    const row = await queryRow("SELECT * FROM complaints WHERE id = $1", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Complaint not found." });
    if (!row.reopen_requested) {
      return res.status(400).json({ error: "There is no reopen request to review." });
    }
    const approve = req.body && req.body.approve === true;
    const updated = await queryRow(
      approve
        ? `UPDATE complaints SET status = 'In Progress', reopen_requested = FALSE,
             reopen_status = 'Approved', updated_at = NOW() WHERE id = $1 RETURNING *`
        : `UPDATE complaints SET reopen_status = 'Rejected',
             updated_at = NOW() WHERE id = $1 RETURNING *`,
      [row.id]
    );
    const profile = await queryRow("SELECT name FROM users WHERE id = $1", [req.user.id]);
    await addEvent(row.id, {
      action: approve ? "Reopen Approved" : "Reopen Rejected",
      description: approve
        ? "Management approved the reopen request. Complaint moved to In Progress."
        : "Management rejected the reopen request. Complaint remains completed.",
      authorId: req.user.id,
      authorName: profile?.name || "Management",
      authorRole: "management",
    });
    res.json({ complaint: toPublicComplaint(updated) });
  } catch (err) {
    next(err);
  }
}

