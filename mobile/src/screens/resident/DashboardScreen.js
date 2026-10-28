/**
 * screens/resident/DashboardScreen.js
 * ------------------------------------------------------------------
 * Port of dashboard.html + js/dashboard.js for mobile.
 *
 * Reuses the website's logic exactly:
 *   - profile name for the greeting ("Hello, <first name>!"),
 *   - room summary from the denormalised profile fields, falling back to
 *     the rooms/{roomId} and units/{unitId} documents when they are missing,
 *   - ONE complaints query (residentId == uid, orderBy createdAt desc) from
 *     which all statistics and lists are derived in memory,
 *   - "Unit Announcements": the newest unit announcements for the resident's
 *     room (collapsed to 2 with a "Show more"/"Show less" toggle, exactly
 *     like the website's announcements feed).
 *
 * Errors never blank the screen: each section shows its own notice, which
 * is the mobile equivalent of the website's per-section error handling.
 */

import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import Button from "../../components/Button";
import ComplaintCard from "../../components/ComplaintCard";
import { Card, ScreenTitle, SectionTitle } from "../../components/Layout";
import NoteList from "../../components/NoteList";
import RoomSummary from "../../components/RoomSummary";
import StatCard from "../../components/StatCard";
import { EmptyState, ErrorNotice, LoadingState } from "../../components/States";
import { useAuth } from "../../context/AuthContext";
import { fetchAnnouncements } from "../../services/announcementService";
import { fetchResidentComplaints } from "../../services/complaintService";
import { fetchRoom, fetchUnit } from "../../services/roomService";
import { colors, spacing, typography } from "../../theme";
import { isActiveStatus, normalizeStatus } from "../../utils/complaints";
import { getErrorMessage } from "../../utils/errors";

/** Newest announcements fetched per load (matches the website's limit). */
const ANNOUNCEMENT_LIMIT = 5;
/** Items shown before the "Show more" toggle (matches the website). */
const COLLAPSED_COUNT = 2;

export default function DashboardScreen({ navigation }) {
  const { profile, uid } = useAuth();

  const [complaints, setComplaints] = useState([]);
  const [roomInfo, setRoomInfo] = useState({ block: null, roomNumber: null, roomLetter: null });
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsError, setAnnouncementsError] = useState("");
  const [announcementsExpanded, setAnnouncementsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /** Room summary with the same fallback chain as js/dashboard.js. */
  const resolveRoomInfo = useCallback(async (profileData) => {
    if (profileData.block != null && profileData.roomNumber != null && profileData.roomLetter != null) {
      return {
        block: profileData.block,
        roomNumber: profileData.roomNumber,
        roomLetter: profileData.roomLetter,
      };
    }
    try {
      const room = await fetchRoom(profileData.roomId);
      const unit = profileData.unitId ? await fetchUnit(profileData.unitId) : null;
      return {
        block: profileData.block ?? room?.block ?? null,
        roomNumber: profileData.roomNumber ?? room?.roomNumber ?? null,
        roomLetter: profileData.roomLetter ?? unit?.roomLetter ?? unit?.unitName ?? null,
      };
    } catch (fallbackError) {
      console.warn("[DashboardScreen] room fallback error:", fallbackError);
      return { block: null, roomNumber: null, roomLetter: null };
    }
  }, []);

  const load = useCallback(async () => {
    if (!profile || !uid) return;
    setError("");
    setAnnouncementsError("");
    setAnnouncementsExpanded(false);
    try {
      const [list, info] = await Promise.all([
        fetchResidentComplaints(uid),
        resolveRoomInfo(profile),
      ]);
      setComplaints(list);
      setRoomInfo(info);

      // Unit announcements feed — loaded independently so a failure only
      // affects this section (per-section error handling, like the website).
      try {
        const feed = await fetchAnnouncements(profile.roomId);
        setAnnouncements(feed.slice(0, ANNOUNCEMENT_LIMIT));
      } catch (announcementError) {
        console.warn("[DashboardScreen] announcements error:", announcementError);
        setAnnouncements([]);
        setAnnouncementsError("Could not load announcements.");
      }
    } catch (loadError) {
      console.error("[DashboardScreen] load error:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile, uid, resolveRoomInfo]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const active = complaints.filter((c) => isActiveStatus(c.status));
  const inProgress = complaints.filter((c) => normalizeStatus(c.status) === "In Progress");
  const completed = complaints.filter((c) => normalizeStatus(c.status) === "Completed");
  const visibleAnnouncements = announcementsExpanded
    ? announcements
    : announcements.slice(0, COLLAPSED_COUNT);

  if (loading) return <LoadingState message="Loading your dashboard…" />;

  const firstName = profile?.name ? String(profile.name).split(" ")[0] : "there";

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <ScreenTitle
        title={`Hello, ${firstName}!`}
        subtitle="Here's your residence overview."
      />

      <ErrorNotice message={error} onRetry={load} />

      <View style={styles.actions}>
        <Button
          title="Submit complaint"
          fullWidth
          onPress={() => navigation.navigate("Report")}
        />
        <Button
          title="Track complaints"
          variant="ghost"
          fullWidth
          onPress={() => navigation.navigate("Reports")}
        />
      </View>

      <RoomSummary
        block={roomInfo.block}
        roomNumber={roomInfo.roomNumber}
        roomLetter={roomInfo.roomLetter}
      />

      <SectionTitle>Your complaint statistics</SectionTitle>
      <View style={styles.statsRow}>
        <StatCard label="Total" value={complaints.length} />
        <StatCard label="Active" value={active.length} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="In progress" value={inProgress.length} accent={colors.info} />
        <StatCard label="Completed" value={completed.length} accent={colors.success} />
      </View>

      <SectionTitle style={styles.sectionSpacer}>Active complaints</SectionTitle>
      {active.length === 0 ? (
        <EmptyState message="You have no active complaints. 🎉" />
      ) : (
        active.map((complaint) => (
          <ComplaintCard
            key={complaint.id}
            complaint={complaint}
            onPress={() => navigation.navigate("ComplaintDetails", { complaintId: complaint.id })}
          />
        ))
      )}

      <SectionTitle style={styles.sectionSpacer}>Unit Announcements</SectionTitle>
      <Card>
        {announcementsError ? (
          <Text style={styles.feedError}>{announcementsError}</Text>
        ) : (
          <>
            <NoteList notes={visibleAnnouncements} emptyMessage="No announcements yet." />
            {announcements.length > COLLAPSED_COUNT ? (
              <Button
                title={
                  announcementsExpanded
                    ? "Show less"
                    : `Show ${announcements.length - COLLAPSED_COUNT} more`
                }
                variant="ghost"
                size="sm"
                style={styles.feedToggle}
                onPress={() => setAnnouncementsExpanded((v) => !v)}
              />
            ) : null}
          </>
        )}
      </Card>

      <SectionTitle style={styles.sectionSpacer}>Complaint history</SectionTitle>
      {complaints.length === 0 ? (
        <EmptyState
          message="You haven't submitted any complaints yet."
          actionLabel="Submit a complaint"
          onAction={() => navigation.navigate("Report")}
        />
      ) : (
        complaints.map((complaint) => (
          <ComplaintCard
            key={complaint.id}
            complaint={complaint}
            onPress={() => navigation.navigate("ComplaintDetails", { complaintId: complaint.id })}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  actions: { gap: spacing.md, marginBottom: spacing.lg },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  sectionSpacer: { marginTop: spacing.xl },
  feedToggle: { alignSelf: "flex-start", marginTop: spacing.sm },
  feedError: { color: colors.textMuted, fontSize: typography.small },
});
