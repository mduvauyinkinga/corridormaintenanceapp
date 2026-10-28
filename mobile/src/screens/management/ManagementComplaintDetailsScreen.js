/**
 * screens/management/ManagementComplaintDetailsScreen.js
 * ------------------------------------------------------------------
 * The management view of one complaint — port of the "Complaint
 * Details" modal (#complaint-modal) in management.html +
 * js/management.js (openDetailModal + its handlers):
 *
 *   - the same detail grid (ID, resident, student number, email, block,
 *     room, letter, issues, status, submitted/updated dates),
 *   - Update Status select → updateStatus() + "Status → X" timeline event,
 *   - Assign Priority select → updatePriority() + timeline event,
 *   - estimated/actual completion date inputs → one updateDoc writing both
 *     dates (null when cleared) + timeline events, exactly like
 *     handleDatesChange(),
 *   - reopen request review with Approve/Reject (handleReopenDecision),
 *   - photo gallery, timeline,
 *   - maintenance notes (read) + "Add a maintenance note" (handleAddNote).
 *
 * Resident/room/unit display fields are resolved with the same fallback
 * chain as resolveComplaintRow() (denormalised ids first, then the room's
 * first bed slot) — the website reuses its cached maps instead, but the
 * resulting values are identical.
 */

import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  OverdueBadge,
  PriorityBadge,
  StatusBadge,
} from "../../components/Badges";
import Button from "../../components/Button";
import DateField from "../../components/DateField";
import { Card, KeyValue, ScreenTitle, SectionTitle } from "../../components/Layout";
import NoteList from "../../components/NoteList";
import OptionPicker from "../../components/OptionPicker";
import PhotoGallery from "../../components/PhotoGallery";
import { ErrorNotice, LoadingState } from "../../components/States";
import TextField from "../../components/TextField";
import Timeline from "../../components/Timeline";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { getUserProfile } from "../../services/authService";
import {
  approveReopen,
  fetchComplaint,
  rejectReopen,
  updateCompletionDates,
  updatePriority,
  updateStatus,
} from "../../services/complaintService";
import { addNote, fetchNotes } from "../../services/noteService";
import { fetchRoom, fetchUnit } from "../../services/roomService";
import { fetchTimeline } from "../../services/timelineService";
import { colors, spacing, typography } from "../../theme";
import {
  COMPLAINT_STATUSES,
  PRIORITIES,
  normalizePriority,
  normalizeStatus,
  shortComplaintId,
} from "../../utils/complaints";
import { formatDate, isOverdue, toDate, toDateInputValue } from "../../utils/dates";
import { getErrorMessage } from "../../utils/errors";

const STATUS_OPTIONS = COMPLAINT_STATUSES.map((value) => ({ value, label: value }));
const PRIORITY_OPTIONS = PRIORITIES.map((value) => ({ value, label: value }));

export default function ManagementComplaintDetailsScreen({ route }) {
  const complaintId = route?.params?.complaintId;
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [complaint, setComplaint] = useState(null);
  const [resident, setResident] = useState(null);
  const [room, setRoom] = useState(null);
  const [unit, setUnit] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  /** The actor object every management write passes (website: currentProfile). */
  const actor = {
    uid: profile?.uid || null,
    name: profile?.name || "Management",
  };

  const load = useCallback(async () => {
    if (!complaintId) return;
    setError("");
    try {
      const [fresh, events, noteList] = await Promise.all([
        fetchComplaint(complaintId),
        fetchTimeline(complaintId),
        fetchNotes(complaintId),
      ]);
      if (!fresh) {
        setComplaint(null);
        setError("This complaint no longer exists.");
        return;
      }
      const [residentDoc, roomDoc, unitDoc] = await Promise.all([
        fresh.residentId ? getUserProfile(fresh.residentId) : null,
        fresh.roomId ? fetchRoom(fresh.roomId) : null,
        fresh.unitId ? fetchUnit(fresh.unitId) : null,
      ]);
      setComplaint(fresh);
      setTimeline(events);
      setNotes(noteList);
      setResident(residentDoc);
      setRoom(roomDoc);
      setUnit(unitDoc);
    } catch (loadError) {
      console.error("[ManagementComplaintDetailsScreen] load error:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [complaintId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /**
   * Run a management write with the website's feedback: toast on success,
   * toast on failure, then re-render the modal (reload) like
   * openDetailModal() does after every handler.
   */
  const run = async (operation, successMessage, successType = "success") => {
    setWorking(true);
    setError("");
    try {
      await operation();
      if (successMessage) showToast(successMessage, successType);
      await load();
    } catch (opError) {
      console.error("[ManagementComplaintDetailsScreen] update error:", opError);
      setError(getErrorMessage(opError));
      showToast("Could not update the complaint. Please try again.", "error");
    } finally {
      setWorking(false);
    }
  };

  /* handleStatusChange — same guard as the website: ignore when unchanged. */
  const handleStatusChange = (value) => {
    if (!complaint || value === normalizeStatus(complaint.status)) return;
    run(
      () => updateStatus(complaint.id, value, actor),
      `Complaint marked as "${value}".`
    );
  };

  /* handlePriorityChange — ignore when unchanged. */
  const handlePriorityChange = (value) => {
    if (!complaint || value === normalizePriority(complaint.priority)) return;
    run(
      () => updatePriority(complaint.id, value, actor),
      `Priority set to "${value}".`
    );
  };

  /**
   * handleDatesChange — ONE write for BOTH fields (null when cleared) and
   * only when something actually changed; updateCompletionDates adds the
   * same per-date timeline events the website adds.
   */
  const handleDatesChange = (which, value) => {
    if (!complaint) return;
    const nextEst = which === "estimated" ? value : toDate(complaint.estimatedCompletion);
    const nextActual = which === "actual" ? value : toDate(complaint.actualCompletion);
    const sameEst =
      toDateInputValue(nextEst) === toDateInputValue(complaint.estimatedCompletion);
    const sameActual =
      toDateInputValue(nextActual) === toDateInputValue(complaint.actualCompletion);
    if (sameEst && sameActual) return;

    run(
      () =>
        updateCompletionDates(complaint.id, {
          estimatedCompletion: nextEst,
          actualCompletion: nextActual,
          actor,
        }),
      "Completion dates updated."
    );
  };

  /* handleReopenDecision(true|false). */
  const handleReopenDecision = (approveDecision) => {
    if (!complaint) return;
    if (approveDecision) {
      run(
        () => approveReopen(complaint.id, actor),
        "Reopen approved. Complaint moved to In Progress."
      );
    } else {
      run(
        () => rejectReopen(complaint.id, actor),
        "Reopen request rejected.",
        "info"
      );
    }
  };

  /* handleAddNote. */
  const handleAddNote = async () => {
    const text = noteText.trim();
    if (!text || !complaint) return;
    setWorking(true);
    setError("");
    try {
      await addNote(complaint.id, {
        text,
        authorId: actor.uid,
        authorName: actor.name,
      });
      setNoteText("");
      showToast("Maintenance note added.", "success");
      await load();
    } catch (noteError) {
      console.error("[ManagementComplaintDetails] add note error:", noteError);
      showToast("Could not add the note. Please check permissions.", "error");
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <LoadingState message="Loading complaint…" />;

  if (!complaint) {
    return (
      <View style={styles.missing}>
        <ErrorNotice message={error || "Complaint not found."} onRetry={load} />
      </View>
    );
  }

  const status = normalizeStatus(complaint.status);
  const priority = normalizePriority(complaint.priority);
  const block = unit?.block || room?.block || "—";
  const roomNumber = unit?.roomNumber ?? room?.roomNumber ?? "—";
  const roomLetter = unit?.roomLetter || unit?.unitName || "—";
  const issues = Array.isArray(complaint.issues)
    ? complaint.issues.join(", ")
    : String(complaint.issues || "—");

  /* renderReopenReview — message + optional Approve/Reject controls. */
  const reopenRequested = Boolean(complaint.reopenRequested);
  const reopenResolved =
    complaint.reopenStatus === "Rejected" || complaint.reopenStatus === "Approved";
  let reopenMessage = "No reopen request.";
  if (reopenRequested) {
    reopenMessage =
      complaint.reopenStatus === "Approved"
        ? "This reopen request was approved. The complaint is In Progress."
        : complaint.reopenStatus === "Rejected"
        ? "This reopen request was rejected. The complaint remains completed."
        : "The resident has requested to reopen this completed complaint.";
  } else if (complaint.reopenStatus === "Approved") {
    reopenMessage = "This complaint was reopened and is In Progress.";
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenTitle
        title={
          complaint.category
            ? `${complaint.category} · ${issues}`
            : "Complaint Details"
        }
        subtitle={`Complaint ${shortComplaintId(complaint.id)} · submitted ${formatDate(
          complaint.createdAt
        )}`}
      />

      <ErrorNotice message={error} onRetry={load} />

      <View style={styles.badgeRow}>
        <StatusBadge status={status} />
        <PriorityBadge priority={priority} />
        {isOverdue(complaint) ? <OverdueBadge /> : null}
      </View>

      {/* modal-details grid */}
      <Card>
        <KeyValue label="Complaint ID">{shortComplaintId(complaint.id)}</KeyValue>
        <KeyValue label="Resident">{resident?.name || "Unknown"}</KeyValue>
        <KeyValue label="Student Number">{resident?.studentNumber || "—"}</KeyValue>
        <KeyValue label="Email">{resident?.email || "—"}</KeyValue>
        <KeyValue label="Block">{block}</KeyValue>
        <KeyValue label="Room Number">{roomNumber}</KeyValue>
        <KeyValue label="Room Letter">{roomLetter}</KeyValue>
        <KeyValue label="Category">{complaint.category || "—"}</KeyValue>
        <KeyValue label="Issues">{issues}</KeyValue>
        <KeyValue label="Current Status">{status}</KeyValue>
        <KeyValue label="Date Submitted">{formatDate(complaint.createdAt)}</KeyValue>
        <KeyValue label="Last Updated">{formatDate(complaint.updatedAt)}</KeyValue>
        <KeyValue label="Resident Notes">{complaint.notes || "—"}</KeyValue>
      </Card>

      {/* Current Status */}
      <SectionTitle>Current Status</SectionTitle>
      <Card>
        <View style={styles.badgeRow}>
          <StatusBadge status={status} />
        </View>
        <OptionPicker
          label="Update Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={handleStatusChange}
          disabled={working}
          modalTitle="Update status"
        />
      </Card>

      {/* Priority (Management) */}
      <SectionTitle>Priority (Management)</SectionTitle>
      <Card>
        <OptionPicker
          label="Assign Priority"
          value={priority}
          options={PRIORITY_OPTIONS}
          onChange={handlePriorityChange}
          disabled={working}
          modalTitle="Assign priority"
        />
      </Card>

      {/* Completion Dates */}
      <SectionTitle>Completion Dates</SectionTitle>
      <Card>
        <DateField
          label="Estimated Completion"
          value={toDate(complaint.estimatedCompletion)}
          onChange={(value) => handleDatesChange("estimated", value)}
          disabled={working}
        />
        <DateField
          label="Actual Completion"
          value={toDate(complaint.actualCompletion)}
          onChange={(value) => handleDatesChange("actual", value)}
          disabled={working}
        />
      </Card>

      {/* Photos */}
      <SectionTitle>Photos</SectionTitle>
      <Card>
        <PhotoGallery urls={complaint.photoURLs} />
      </Card>

      {/* Timeline */}
      <SectionTitle>Timeline</SectionTitle>
      <Card>
        <Timeline events={timeline} />
      </Card>

      {/* Reopen Request */}
      <SectionTitle>Reopen Request</SectionTitle>
      <Card>
        <Text style={styles.reopenMessage}>{reopenMessage}</Text>
        {reopenRequested ? (
          <View style={styles.reopenActions}>
            <Button
              title="Approve"
              size="sm"
              disabled={reopenResolved || working}
              onPress={() => handleReopenDecision(true)}
            />
            <Button
              title="Reject"
              size="sm"
              variant="ghost"
              disabled={reopenResolved || working}
              onPress={() => handleReopenDecision(false)}
            />
          </View>
        ) : null}
      </Card>

      {/* Maintenance Notes */}
      <SectionTitle>Maintenance Notes</SectionTitle>
      <Card>
        <NoteList notes={notes} emptyMessage="No maintenance notes yet." />
        <TextField
          label="Add a maintenance note"
          value={noteText}
          onChangeText={setNoteText}
          placeholder="e.g. Technician assigned. Waiting for replacement lock."
          multiline
          numberOfLines={3}
        />
        <Button
          title="Add Note"
          size="sm"
          loading={working && noteText.trim().length > 0}
          loadingText="Adding…"
          disabled={!noteText.trim()}
          onPress={handleAddNote}
          style={styles.addNoteButton}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  missing: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  badgeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginBottom: spacing.lg,
  },
  reopenMessage: { color: colors.textMuted, fontSize: typography.small },
  reopenActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  addNoteButton: { marginTop: spacing.sm, alignSelf: "flex-start" },
});

