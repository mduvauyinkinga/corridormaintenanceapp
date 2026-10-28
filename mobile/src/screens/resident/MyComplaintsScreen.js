/**
 * screens/resident/MyComplaintsScreen.js
 * ------------------------------------------------------------------
 * Port of tracking.html + js/tracking.js (the list part).
 *
 * The website's 9-column table becomes a list of cards — the same fields
 * (issues, category, priority, room, unit, reporter, date, status) plus
 * the same per-row actions: View (details), Edit and Cancel. Edit/Cancel
 * are enabled only while the complaint is "Submitted" or "Received" AND
 * was filed by this resident — a unit mate's report is visible but
 * read-only, exactly like the website (and the server enforces it too).
 */

import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { OverdueBadge, PriorityBadge, StatusBadge } from "../../components/Badges";
import Button from "../../components/Button";
import { Card, ScreenTitle, SectionTitle } from "../../components/Layout";
import { EmptyState, ErrorNotice, LoadingState } from "../../components/States";
import { useAuth } from "../../context/AuthContext";
import { fetchResidentComplaints } from "../../services/complaintService";
import { resolveRoomAndUnitLabels } from "../../services/roomService";
import { colors, spacing, typography } from "../../theme";
import { formatIssues, isCancellableStatus, isEditableStatus } from "../../utils/complaints";
import { formatDate, isOverdue } from "../../utils/dates";
import { getErrorMessage } from "../../utils/errors";

export default function MyComplaintsScreen({ navigation }) {
  const { uid } = useAuth();

  const [complaints, setComplaints] = useState([]);
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /** Per-screen cache so a resident's room/unit is resolved once only. */
  const cache = useMemo(() => ({ room: {}, unit: {} }), []);

  const load = useCallback(async () => {
    setError("");
    try {
      const list = await fetchResidentComplaints(uid, { scope: "unit" });
      setComplaints(list);

      const resolved = {};
      for (const complaint of list) {
        resolved[complaint.id] = await resolveRoomAndUnitLabels(
          complaint.roomId,
          complaint.unitId,
          cache
        );
      }
      setLabels(resolved);
    } catch (loadError) {
      console.error("[MyComplaintsScreen] load error:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [uid, cache]);

  // Reload when the screen regains focus so a new or edited complaint shows
  // up immediately, mirroring a fresh page load on the website.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return <LoadingState message="Loading complaints…" />;

  return (
    <FlatList
      data={complaints}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View>
          <ScreenTitle
            title="Complaints"
            subtitle="Reports filed by you and your unit mates."
          />
          <ErrorNotice message={error} onRetry={load} />
          {complaints.length === 0 ? (
            <EmptyState
              message="No complaints from you or your unit mates yet."
              actionLabel="New complaint"
              onAction={() => navigation.navigate("Report")}
            />
          ) : (
            <SectionTitle>
              {`${complaints.length} report${complaints.length === 1 ? "" : "s"}`}
            </SectionTitle>
          )}
        </View>
      }
      renderItem={({ item }) => {
        const label = labels[item.id] || {};
        // A unit mate's report is visible but read-only (server-enforced too).
        const mine = item.residentId === uid;
        const editable = mine && isEditableStatus(item.status);
        const cancellable = mine && isCancellableStatus(item.status);
        return (
          <Card style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.title} numberOfLines={2}>
                {formatIssues(item.issues)}
              </Text>
              <StatusBadge status={item.status} />
            </View>

            <View style={styles.badges}>
              <PriorityBadge priority={item.priority} />
              {isOverdue(item) ? <OverdueBadge /> : null}
            </View>

            <View style={styles.metaGrid}>
              <Text style={styles.meta}>{`Category: ${item.category || "—"}`}</Text>
              <Text style={styles.meta}>{`Room: ${label.roomLabel || "—"}`}</Text>
              <Text style={styles.meta}>{`Unit: ${label.unitLabel || "—"}`}</Text>
              <Text style={styles.meta}>{`Date: ${formatDate(item.createdAt)}`}</Text>
              <Text style={mine ? styles.meta : styles.metaShared}>
                {`Reported by: ${mine ? "You" : item.residentName || "Unit mate"}`}
              </Text>
            </View>

            <View style={styles.actions}>
              <Button
                title="View"
                size="sm"
                variant="ghost"
                onPress={() =>
                  navigation.navigate("TrackedComplaintDetails", { complaintId: item.id })
                }
              />
              <Button
                title="Edit"
                size="sm"
                disabled={!editable}
                onPress={() => navigation.navigate("EditComplaint", { complaintId: item.id })}
              />
              <Button
                title="Cancel"
                size="sm"
                variant="danger"
                disabled={!cancellable}
                onPress={() =>
                  navigation.navigate("TrackedComplaintDetails", {
                    complaintId: item.id,
                    intent: "cancel",
                  })
                }
              />
            </View>
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: { paddingHorizontal: spacing.lg },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { flex: 1, fontWeight: "700", color: colors.text, fontSize: typography.body },
  badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
  metaGrid: { marginTop: spacing.md, gap: 2 },
  meta: { color: colors.textMuted, fontSize: typography.small },
  metaShared: { color: colors.text, fontSize: typography.small, fontWeight: "600" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
});
