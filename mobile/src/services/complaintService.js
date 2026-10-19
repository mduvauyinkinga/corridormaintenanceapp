/**
 * services/complaintService.js
 * ------------------------------------------------------------------
 * All complaint reads and writes (REST version).
 *
 * Port of:
 *   - js/complaints.js  (submit a complaint)
 *   - js/tracking.js    (my complaints, edit, cancel, reopen request)
 *   - js/management.js  (status, priority, completion dates, reopen decision)
 *
 * Both clients call the SAME endpoints, so field names, defaults and
 * response shapes are identical:
 *   GET    /api/complaints                     -> own (resident) or all (management)
 *   GET    /api/complaints/:id                 -> single (owner or management)
 *   POST   /api/complaints                     -> create (Submitted/Low)
 *   PATCH  /api/complaints/:id                 -> resident edit (Submitted/Received)
 *   POST   /api/complaints/:id/cancel          -> cancel (Submitted/Received)
 *   POST   /api/complaints/:id/reopen          -> reopen request
 *   PATCH  /api/complaints/:id/status          -> management
 *   PATCH  /api/complaints/:id/priority        -> management
 *   PATCH  /api/complaints/:id/dates           -> management
 *   POST   /api/complaints/:id/reopen-decision -> management
 *
 * Timeline events are written by the SERVER on every action, so clients
 * never post events themselves. `actor`/authorId/authorName parameters
 * stay in the signatures for call-site parity; the server derives the
 * real author from the verified token.
 */

import { api, resolvePhotoURL } from "./api";

/* ------------------------------- Reads ---------------------------------- */

/** Map a server complaint and resolve its photo URLs for React Native. */
function present(complaint) {
  if (!complaint) return null;
  return {
    ...complaint,
    photoURLs: Array.isArray(complaint.photoURLs)
      ? complaint.photoURLs.map(resolvePhotoURL)
      : [],
  };
}

/**
 * The signed-in resident's complaints, newest first.
 * Pass { scope: "unit" } to also include the reports filed by unit mates
 * (the tracking list does this; dashboards/stats keep the default so they
 * only count this resident's own reports).
 */
export async function fetchResidentComplaints(uid, { scope } = {}) {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  const data = await api(`/complaints${query}`);
  const complaints = Array.isArray(data.complaints) ? data.complaints : [];
  return complaints.map(present);
}

/** Every complaint (management bulk read). */
export async function fetchAllComplaints() {
  const data = await api("/complaints");
  const complaints = Array.isArray(data.complaints) ? data.complaints : [];
  return complaints.map(present);
}

/**
 * A single complaint by id (used when a screen is opened from a list and
 * needs the freshest copy — e.g. after an edit or a management update).
 */
export async function fetchComplaint(complaintId) {
  if (!complaintId) return null;
  try {
    const data = await api(`/complaints/${encodeURIComponent(complaintId)}`);
    return present(data.complaint);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}


/* --------------------------- Resident writes ---------------------------- */

/**
 * Create a complaint (server defaults it to Submitted/Low, stores any
 * photos, and writes the initial "Complaint Submitted" timeline event).
 * `photoURLs` are data-URLs produced by storageService.uploadComplaintPhoto.
 */
export async function createComplaint({
  uid,
  profile,
  category,
  issues,
  notes,
  photoURLs = [],
}) {
  const data = await api("/complaints", {
    method: "POST",
    body: {
      category,
      issues,
      notes: notes || "",
      photos: photoURLs,
    },
  });
  return data.complaint && data.complaint.id;
}

/**
 * Resident edit: category, issues and notes only. The server refuses
 * anything except Submitted/Received and writes the timeline event.
 */
export async function updateComplaintDetails(
  complaintId,
  { category, issues, notes, authorId, authorName }
) {
  await api(`/complaints/${encodeURIComponent(complaintId)}`, {
    method: "PATCH",
    body: { category, issues, notes },
  });
}

/**
 * Resident cancel. The server allows ONLY from Submitted/Received and
 * writes the timeline event.
 */
export async function cancelComplaint(complaintId, { authorId, authorName }) {
  await api(`/complaints/${encodeURIComponent(complaintId)}/cancel`, {
    method: "POST",
  });
}

/* -------------------------- Management writes --------------------------- */

/** Management: change the workflow status (server writes the event). */
export async function updateStatus(complaintId, status, actor) {
  await api(`/complaints/${encodeURIComponent(complaintId)}/status`, {
    method: "PATCH",
    body: { status },
  });
}

/** Management: assign a priority (server writes the event). */
export async function updatePriority(complaintId, priority, actor) {
  await api(`/complaints/${encodeURIComponent(complaintId)}/priority`, {
    method: "PATCH",
    body: { priority },
  });
}

/**
 * Management: estimated + actual completion dates.
 * Accepts Date objects (or null) exactly like the website wrote them;
 * the API takes "YYYY-MM-DD" strings and writes one timeline event per
 * date that was filled in.
 */
export async function updateCompletionDates(
  complaintId,
  { estimatedCompletion, actualCompletion, actor }
) {
  const toDateString = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  };

  await api(`/complaints/${encodeURIComponent(complaintId)}/dates`, {
    method: "PATCH",
    body: {
      estimatedCompletion: toDateString(estimatedCompletion),
      actualCompletion: toDateString(actualCompletion),
    },
  });
}

/** Management: approve a reopen request -> back to "In Progress". */
export async function approveReopen(complaintId, actor) {
  await api(`/complaints/${encodeURIComponent(complaintId)}/reopen-decision`, {
    method: "POST",
    body: { approve: true },
  });
}

/** Management: reject a reopen request (the complaint stays Completed). */
export async function rejectReopen(complaintId, actor) {
  await api(`/complaints/${encodeURIComponent(complaintId)}/reopen-decision`, {
    method: "POST",
    body: { approve: false },
  });
}

/** Resident reopen request for a Completed complaint. */
export async function requestReopen(complaintId) {
  await api(`/complaints/${encodeURIComponent(complaintId)}/reopen`, {
    method: "POST",
    body: {},
  });
}
