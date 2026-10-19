/**
 * routes/complaints.js
 * ------------------------------------------------------------------
 * Complaint endpoints (mirror of js/complaints.js + tracking.js +
 * dashboard.js + management.js Firestore calls).
 *
 * Resident:
 *   GET    /api/complaints?residentId=:uid  -> own list, newest first
 *          &scope=unit                      -> own + unit mates' reports
 *   GET    /api/complaints/:id              -> single (owner, unit mate, management)
 *                                              …edit/cancel/reopen stay owner-only
 *   POST   /api/complaints                  -> create (Submitted/Low)
 *   PATCH  /api/complaints/:id              -> edit (Submitted/Received)
 *   POST   /api/complaints/:id/cancel       -> cancel
 *   POST   /api/complaints/:id/reopen       -> request reopen
 *   GET    /api/complaints/:id/timeline     -> events, oldest first
 *   GET    /api/complaints/:id/notes        -> notes, oldest first
 *   GET    /api/complaints/:id/photos/:pid  -> photo bytes
 *
 * Management (all of the above for any complaint, plus):
 *   POST   /api/complaints/:id/notes        -> add maintenance note
 *   PATCH  /api/complaints/:id/status       -> workflow status
 *   PATCH  /api/complaints/:id/priority     -> Low/Med/High/Emergency
 *   PATCH  /api/complaints/:id/dates        -> estimate/actual dates
 *   POST   /api/complaints/:id/reopen-decision -> approve/reject
 */
import { Router } from "express";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import {
  listComplaints,
  getComplaint,
  createComplaint,
  editComplaint,
  cancelComplaint,
  requestReopen,
  listTimeline,
  listNotes,
  addNote,
  getPhoto,
  updateStatus,
  updatePriority,
  updateDates,
  decideReopen,
} from "../controllers/complaintsController.js";

const router = Router();

// Photo bytes are fetched by <img src> / <Image source>, which cannot
// send an Authorization header. This route is therefore registered
// BEFORE the router-wide auth guard and uses optionalAuth: it accepts
// either a valid Bearer token or a short-lived HMAC signature
// (see photoToken.js), so photos render for the owner and for
// management while staying inaccessible to everyone else.
router.get("/:id/photos/:photoId", optionalAuth, getPhoto);

router.use(requireAuth);

router.get("/", listComplaints);
router.post("/", createComplaint);
router.get("/:id", getComplaint);
router.patch("/:id", editComplaint);
router.post("/:id/cancel", cancelComplaint);
router.post("/:id/reopen", requestReopen);
router.get("/:id/timeline", listTimeline);
router.get("/:id/notes", listNotes);
router.post("/:id/notes", addNote);
router.patch("/:id/status", updateStatus);
router.patch("/:id/priority", updatePriority);
router.patch("/:id/dates", updateDates);
router.post("/:id/reopen-decision", decideReopen);

export default router;
