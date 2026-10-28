/**
 * screens/resident/ComplaintDetailsScreen.js
 * ------------------------------------------------------------------
 * The resident view of one complaint — port of the "Complaint Details"
 * modal in tracking.html + js/tracking.js:
 *   - details grid (issues, category, priority, room, unit, current status,
 *     date submitted, estimated/actual completion, notes),
 *   - photo gallery (the same download URLs),
 *   - timeline (complaints/{id}/timeline, oldest first),
 *   - maintenance notes (read-only for residents),
 *   - reopen request control:
 *       Completed + no request  → "Request Reopen" button
 *       Completed + requested   → Pending / Approved / Rejected message
 *       In Progress + requested → "reopened and In Progress" message
 *   - the list actions from the website's table rows are also offered
 *     here (Edit while Submitted/Received, Cancel from Submitted/Received),
 *     because a phone screen cannot show a separate "Manage" column.
 */

import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { OverdueBadge, PriorityBadge, StatusBadge } from "../../components/Badges";
import Button from "../../components/Button";
import { Card, KeyValue, ScreenTitle, SectionTitle } from "../../components/Layout";
import NoteList from "../../components/NoteList";
import PhotoGallery from "../../components/PhotoGallery";
import {
  ErrorNotice,
  FormAlert,
  LoadingState,
} from "../../components/States";
import Timeline from "../../components/Timeline";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  cancelComplaint,
  fetchComplaint,
  requestReopen,
} from "../../services/complaintService";
import { fetchNotes } from "../../services/noteService";
import { resolveRoomAndUnitLabels } from "../../services/roomService";
import { fetchTimeline } from "../../services/timelineService";
import { colors, spacing, typography } from "../../theme";
import {
  formatIssues,
  isCancellableStatus,
  isEditableStatus,
  normalizeStatus,
} from "../../utils/complaints";
import { formatDate, isOverdue } from "../../utils/dates";
import { getErrorMessage } from "../../utils/errors";

export default function ComplaintDetailsScreen({ navigation, route }) {
  const complaintId = route?.params?.complaintId;
  const intent = route?.params?.intent;
  const { profile, uid } = useAuth();
  const { showToast } = useToast();

  const [complaint, setComplaint] = useState(null);
  const [labels, setLabels] = useState({});
  const [timeline, setTimeline] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const cache = useMemo(() => ({ room: {}, unit: {} }), []);

  const load = useCallback(async () => {
    if (!complaintId) return;
    setError("");
    try {
      const [fresh, events, noteList] = await Promise.all([
        fetchComplaint(complaintId),
        fetchTimeline(complaintId),
        fetchNotes(complaintId),
      ]);
      setComplaint(fresh);
      setTimeline(events);
      setNotes(noteList);
      if (fresh) {
        setLabels(await resolveRoomAndUnitLabels(fresh.roomId, fresh.unitId, cache));
      }
    } catch (loadError) {
      console.error("[ComplaintDetailsScreen] load error:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [complaintId, cache]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /* Cancel: rules allow it only from Submitted/Received (tracking.js). */
  const handleCancel = useCallback(async () => {
    if (!complaint) return;
    if (!isCancellableStatus(complaint.status)) {
      showToast("This complaint can no longer be cancelled.", "error");
      return;
    }
    setWorking(true);
    try {
      await cancelComplaint(complaint.id, {
        authorId: uid,
        authorName: profile?.name || "Resident",
      });
      showToast("Complaint cancelled.", "info");
      await load();
    } catch (cancelError) {
      console.error("[ComplaintDetailsScreen] cancel error:", cancelError);
      showToast("Could not cancel the complaint. Please try again.", "error");
    } finally {
      setWorking(false);
    }
  }, [complaint, uid, profile, showToast, load]);

  const confirmCancel = useCallback(() => {
    Alert.alert(
      "Cancel complaint",
      "Are you sure you want to cancel this complaint? This cannot be undone.",
      [
        { text: "Keep it", style: "cancel" },
        { text: "Cancel complaint", style: "destructive", onPress: handleCancel },
      ]
    );
  }, [handleCancel]);

  /* The "Cancel" action in the list opens this screen with intent=cancel. */
  useEffect(() => {
    if (intent === "cancel" && complaint && isCancellableStatus(complaint.status)) {
      confirmCancel();
    }
  }, [intent, complaint, confirmCancel]);

  /* Reopen request: only for a Completed complaint without a request yet. */
  const handleReopen = useCallback(async () => {
    if (!complaint) return;
    setWorking(true);
    try {
      await requestReopen(complaint.id);
      showToast("Reopen request submitted for management review.", "success");
      await load();
    } catch (reopenError) {
      console.error("[ComplaintDetailsScreen] reopen error:", reopenError);
      showToast("Could not submit the reopen request. Please try again.", "error");
    } finally {
      setWorking(false);
    }
  }, [complaint, showToast, load]);

  if (loading) return <LoadingState message="Loading complaint…" />;

  if (!complaint) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorNotice
          message={error || "This complaint could not be found."}
          onRetry={load}
        />
      </ScrollView>
    );
  }

  const status = normalizeStatus(complaint.status);
  // A unit mate can open this screen, but only the resident who filed the
  // report may edit, cancel or reopen it (the server refuses otherwise).
  const mine = complaint.residentId === uid;
  const editable = mine && isEditableStatus(complaint.status);
  const cancellable = mine && isCancellableStatus(complaint.status);

  const reopenMessage = (() => {
    if (!mine) {
      return "Only the resident who reported this can request a reopen.";
    }
    if (status === "Completed") {
      if (!complaint.reopenRequested) {
        return "If you believe this complaint was not fully resolved, you can request to reopen it.";
      }
      if (complaint.reopenStatus === "Approved") {
        return "Your reopen request was approved. The complaint is now In Progress.";
      }
      if (complaint.reopenStatus === "Rejected") {
        return "Your reopen request was rejected. The complaint remains completed.";
      }
      return "Your reopen request is waiting for management review.";
    }
    if (status === "In Progress" && complaint.reopenRequested) {
      return "This complaint was reopened and is In Progress.";
    }
    return "A complaint can be reopened once it has been completed.";
  })();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenTitle
        title={formatIssues(complaint.issues)}
        subtitle={`Submitted ${formatDate(complaint.createdAt)}`}
      />

      <ErrorNotice message={error} onRetry={load} />

      <View style={styles.badgeRow}>
        <StatusBadge status={status} />
        <PriorityBadge priority={complaint.priority} />
        {isOverdue(complaint) ? <OverdueBadge /> : null}
      </View>

      <Card>
        <KeyValue label="Issues">{formatIssues(complaint.issues)}</KeyValue>
        <KeyValue label="Category">{complaint.category || "—"}</KeyValue>
        <KeyValue label="Room">{labels.roomLabel || "—"}</KeyValue>
        <KeyValue label="Unit">{labels.unitLabel || "—"}</KeyValue>
        <KeyValue label="Reported by">
          {mine ? "You" : complaint.residentName || "Unit mate"}
        </KeyValue>
        <KeyValue label="Current status">{status}</KeyValue>
        <KeyValue label="Date submitted">{formatDate(complaint.createdAt)}</KeyValue>
        <KeyValue label="Last updated">{formatDate(complaint.updatedAt)}</KeyValue>
        <KeyValue label="Estimated completion">
          {formatDate(complaint.estimatedCompletion)}
        </KeyValue>
        <KeyValue label="Actual completion">{formatDate(complaint.actualCompletion)}</KeyValue>
        <KeyValue label="Your notes">{complaint.notes || "—"}</KeyValue>
      </Card>

      <SectionTitle>Photos</SectionTitle>
      <Card>
        <PhotoGallery urls={complaint.photoURLs} />
      </Card>

      <SectionTitle>Timeline</SectionTitle>
      <Card>
        <Timeline events={timeline} />
      </Card>

      <SectionTitle>Maintenance notes</SectionTitle>
      <Card>
        <NoteList notes={notes} emptyMessage="No maintenance notes yet." />
      </Card>

      <SectionTitle>Reopen complaint</SectionTitle>
      <Card>
        <Text style={styles.reopenMessage}>{reopenMessage}</Text>
        {mine && status === "Completed" && !complaint.reopenRequested ? (
          <Button
            title="Request Reopen"
            variant="ghost"
            loading={working}
            loadingText="Sending…"
            onPress={handleReopen}
            style={styles.reopenButton}
          />
        ) : null}
      </Card>

      <View style={styles.actions}>
        <Button
          title="Edit complaint"
          variant="primary"
          disabled={!editable}
          onPress={() =>
            navigation.navigate("Reports", {
              screen: "EditComplaint",
              params: { complaintId: complaint.id },
            })
          }
        />
        <Button
          title="Cancel complaint"
          variant="danger"
          disabled={!cancellable}
          onPress={confirmCancel}
        />
      </View>

      {!mine ? (
        <Text style={styles.disabledHint}>
          This report was filed by your unit mate — only they can edit or
          cancel it.
        </Text>
      ) : !editable ? (
        <Text style={styles.disabledHint}>
          Editing is only possible while a complaint is Submitted or Received.
        </Text>
      ) : null}
      <FormAlert message="" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  badgeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, flexWrap: "wrap" },
  reopenMessage: { color: colors.textMuted, fontSize: typography.small },
  reopenButton: { marginTop: spacing.md },
  actions: { gap: spacing.md, marginTop: spacing.lg },
  disabledHint: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: typography.tiny,
    textAlign: "center",
  },
});
