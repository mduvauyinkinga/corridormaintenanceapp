/**
 * screens/management/RoomProfileScreen.js
 * ------------------------------------------------------------------
 * The Room Profile modal (#unit-modal + openUnitModal in
 * js/management.js) as a stacked screen:
 *   - summary grid (room, sub-rooms, bed occupancy, residents,
 *     complaints, active complaints),
 *   - residents of the room with their complaint counters,
 *   - "Message everyone in this unit" announcement form + history
 *     (unitAnnouncements, handleUnitAnnouncement),
 *   - every complaint grouped for this room (newest first) with a
 *     "View Details" action that opens the management complaint details
 *     screen (the web flow closes the unit modal and opens the
 *     complaint modal).
 *
 * The screen loads the management data set once (the same four reads the
 * website performs on page load) and derives everything else in memory.
 */

import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Badge, StatusBadge } from "../../components/Badges";
import Button from "../../components/Button";
import { Card, KeyValue, ScreenTitle, SectionTitle } from "../../components/Layout";
import NoteList from "../../components/NoteList";
import { ErrorNotice, LoadingState } from "../../components/States";
import TextField from "../../components/TextField";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { fetchAnnouncements, sendAnnouncement } from "../../services/announcementService";
import {
  buildRoomProfiles,
  loadManagementData,
  resolveComplaintRow,
  resolveRoomProfile,
} from "../../services/managementService";
import { colors, spacing, typography } from "../../theme";
import { timestampMs } from "../../utils/dates";
import { getErrorMessage } from "../../utils/errors";

export default function RoomProfileScreen({ navigation, route }) {
  const roomId = route?.params?.roomId;
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadAnnouncements = useCallback(async () => {
    try {
      setAnnouncements(await fetchAnnouncements(roomId));
    } catch (loadError) {
      console.warn("[RoomProfileScreen] announcements error:", loadError);
    }
  }, [roomId]);

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await loadManagementData();
      setData(next);
      await loadAnnouncements();
    } catch (loadError) {
      console.error("[RoomProfileScreen] load error:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [loadAnnouncements]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const resolved = useMemo(() => {
    if (!data || !roomId) return null;
    const profileEntry = buildRoomProfiles(data).get(roomId);
    return profileEntry ? resolveRoomProfile(profileEntry) : null;
  }, [data, roomId]);

  /** Per-resident complaint counts across ALL complaints (unit modal parity). */
  const residentCounts = useMemo(() => {
    const counts = {};
    if (!data) return counts;
    data.complaints.forEach((complaint) => {
      counts[complaint.residentId] = (counts[complaint.residentId] || 0) + 1;
    });
    return counts;
  }, [data]);

  const complaints = useMemo(() => {
    if (!data || !resolved) return [];
    return resolved.complaints
      .slice()
      .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt))
      .map((complaint) => resolveComplaintRow(complaint, data));
  }, [data, resolved]);

  const handleSend = async () => {
    const text = message.trim();
    if (!text) return;
    setSending(true);
    setError("");
    try {
      await sendAnnouncement({
        roomId,
        message: text,
        authorName: profile?.name || "Management",
      });
      setMessage("");
      showToast("Shared unit update sent.", "success");
      await loadAnnouncements();
    } catch (sendError) {
      console.error("[RoomProfileScreen] announcement error:", sendError);
      showToast("Could not send the shared update. Please check permissions.", "error");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <LoadingState message="Loading room profile…" />;
  if (!resolved) {
    return (
      <View style={styles.missing}>
        <ErrorNotice
          message={error || "This room profile is no longer available."}
          onRetry={load}
        />
      </View>
    );
  }

  const subRooms = resolved.subRooms.map(({ letter, slots }) => ({
    letter,
    total: slots.length,
    occupied: slots.filter((slot) => slot.occupied === true).length,
  }));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenTitle
        title={`Room Profile · ${resolved.label}`}
        subtitle={`${subRooms.length} sub-rooms · ${resolved.occupiedCount}/${resolved.units.length} beds occupied`}
      />
      <ErrorNotice message={error} onRetry={load} />

      {/* unit-modal-summary grid */}
      <Card>
        <KeyValue label="Room">{resolved.label}</KeyValue>
        <KeyValue label="Sub-rooms">
          {`${subRooms.length} (${subRooms.map((sub) => sub.letter).join(", ")})`}
        </KeyValue>
        <KeyValue label="Bed occupancy">
          {`${resolved.occupiedCount}/${resolved.units.length} occupied`}
        </KeyValue>
        <KeyValue label="Residents">{String(resolved.residents.length)}</KeyValue>
        <KeyValue label="Complaints">{String(resolved.complaintCount)}</KeyValue>
        <KeyValue label="Active Complaints">{String(resolved.activeCount)}</KeyValue>
      </Card>

      {/* Residents in this unit */}
      <SectionTitle>Residents in this Unit</SectionTitle>
      <Card>
        {resolved.residents.length === 0 ? (
          <Text style={styles.empty}>No residents assigned to this room.</Text>
        ) : (
          resolved.residents.map((residentDoc) => {
            const residentUnit = residentDoc.unitId
              ? data.unitsMap[residentDoc.unitId]
              : null;
            return (
              <View key={residentDoc.uid} style={styles.residentRow}>
                <View style={styles.residentInfo}>
                  <Text style={styles.residentName}>{residentDoc.name || "Unnamed"}</Text>
                  <Text style={styles.residentMeta}>
                    {`${residentDoc.studentNumber || "—"} · Room ${
                      residentUnit?.roomLetter || residentUnit?.unitName || "—"
                    } · ${residentDoc.email || ""}`}
                  </Text>
                </View>
                <Badge bg={colors.status.Submitted.bg} fg={colors.status.Submitted.fg}>
                  {`${residentCounts[residentDoc.uid] || 0} complaint${
                    (residentCounts[residentDoc.uid] || 0) === 1 ? "" : "s"
                  }`}
                </Badge>
              </View>
            );
          })
        )}
      </Card>

      {/* Message everyone in this unit */}
      <SectionTitle>Message everyone in this unit</SectionTitle>
      <Card>
        <Text style={styles.hint}>
          This sends one shared update to every resident assigned to this room.
        </Text>
        <TextField
          label="Shared update"
          value={message}
          onChangeText={setMessage}
          placeholder="For example: Please clean the shared kitchen today."
          multiline
          numberOfLines={3}
          maxLength={500}
        />
        <Button
          title="Send update"
          loading={sending}
          loadingText="Sending…"
          disabled={!message.trim()}
          onPress={handleSend}
          style={styles.sendButton}
        />
        <View style={styles.announcementList}>
          <NoteList
            notes={announcements}
            emptyMessage="No shared updates for this unit yet."
          />
        </View>
      </Card>

      {/* All complaints for this unit */}
      <SectionTitle>All Complaints for this Unit</SectionTitle>
      {complaints.length === 0 ? (
        <Card>
          <Text style={styles.empty}>No complaints for this unit.</Text>
        </Card>
      ) : (
        complaints.map((row) => (
          <Card key={row.id} style={styles.complaintCard}>
            <View style={styles.complaintHead}>
              <Text style={styles.complaintTitle} numberOfLines={2}>
                {`${row.category} · ${row.issues}`}
              </Text>
              <StatusBadge status={row.status} />
            </View>
            <Text style={styles.complaintMeta}>
              {`By ${row.name} (${row.studentNumber}) · ${formatDate(row.createdAt)} · ${row.shortId}`}
            </Text>
            <Button
              title="View Details"
              size="sm"
              variant="ghost"
              accessibilityLabel={`View complaint ${row.shortId}`}
              onPress={() =>
                navigation.navigate("Complaints", {
                  screen: "ManageComplaintDetails",
                  params: { complaintId: row.id },
                })
              }
              style={styles.viewDetails}
            />
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  missing: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  empty: { color: colors.textMuted, fontSize: typography.small },
  hint: { color: colors.textMuted, fontSize: typography.small, marginBottom: spacing.md },
  residentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  residentInfo: { flex: 1 },
  residentName: { fontSize: typography.body, fontWeight: "700", color: colors.text },
  residentMeta: { marginTop: 2, fontSize: typography.small, color: colors.textMuted },
  sendButton: { alignSelf: "flex-start" },
  announcementList: { marginTop: spacing.lg },
  complaintCard: { paddingVertical: spacing.md },
  complaintHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  complaintTitle: { flex: 1, fontSize: typography.body, fontWeight: "700", color: colors.text },
  complaintMeta: { marginTop: spacing.xs, fontSize: typography.small, color: colors.textMuted },
  viewDetails: { marginTop: spacing.sm, alignSelf: "flex-start" },
});

