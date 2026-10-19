/**
 * screens/management/UnitsScreen.js
 * ------------------------------------------------------------------
 * The Unit Profiles tab — port of `#view-units` + renderBlockPicker() /
 * renderUnits() in js/management.js.
 *
 * Stage 1: a block picker grid (one card per block that has rooms).
 * Stage 2: the selected block's room cards with search + status filters,
 * occupancy chips per sub-room (A/B/C), complaint counters and a
 * "View Profile" action opening RoomProfileScreen (the web #unit-modal).
 */

import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Badge, OccupancyChip } from "../../components/Badges";
import Button from "../../components/Button";
import { Card, ScreenTitle, SectionTitle } from "../../components/Layout";
import OptionPicker from "../../components/OptionPicker";
import TextField from "../../components/TextField";
import { EmptyState, ErrorNotice, LoadingState } from "../../components/States";
import {
  buildRoomProfiles,
  buildUnitCards,
  listBlocks,
  loadManagementData,
} from "../../services/managementService";
import { colors, radius, spacing, typography } from "../../theme";
import { getErrorMessage } from "../../utils/errors";

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "occupied", label: "Occupied" },
  { value: "available", label: "Available" },
  { value: "has-complaints", label: "Has Complaints" },
];

export default function UnitsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedBlock, setSelectedBlock] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await loadManagementData());
    } catch (loadError) {
      console.error("[UnitsScreen] load error:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const profiles = useMemo(() => (data ? buildRoomProfiles(data) : null), [data]);
  const blocks = useMemo(() => (profiles ? listBlocks(profiles) : []), [profiles]);

  /** Rooms per block, for the block picker meta line (renderBlockPicker). */
  const blockCounts = useMemo(() => {
    const counts = {};
    if (!profiles) return counts;
    profiles.forEach((profile) => {
      const block =
        profile.room?.block || profile.units[0]?.block || null;
      if (block) counts[block] = (counts[block] || 0) + 1;
    });
    return counts;
  }, [profiles]);

  const cards = useMemo(() => {
    if (!profiles || !selectedBlock) return [];
    return buildUnitCards(profiles, { block: selectedBlock, term, status });
  }, [profiles, selectedBlock, term, status]);

  if (loading) return <LoadingState message="Loading unit profiles…" />;

  /* Stage 1 — block picker (units-block-picker). */
  if (!selectedBlock) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle
          title="Unit Profiles"
          subtitle="Select a block to view its unit profiles."
        />
        <ErrorNotice message={error} onRetry={load} />
        {blocks.length === 0 ? (
          <EmptyState message="No unit profiles available." />
        ) : (
          <View style={styles.blockGrid}>
            {blocks.map((block) => (
              <Pressable
                key={block}
                onPress={() => {
                  setTerm("");
                  setStatus("");
                  setSelectedBlock(block);
                }}
                accessibilityRole="button"
                accessibilityLabel={`View unit profiles for Block ${block}`}
                style={({ pressed }) => [
                  styles.blockCard,
                  pressed && styles.blockCardPressed,
                ]}
              >
                <Text style={styles.blockName}>Block {block}</Text>
                <Text style={styles.blockMeta}>
                  {`${blockCounts[block] || 0} room${
                    (blockCounts[block] || 0) === 1 ? "" : "s"
                  }`}
                </Text>
                <Text style={styles.blockCta}>View</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  /* Stage 2 — rooms of the selected block (units-block-view + toolbar). */
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenTitle
        title={`Block ${selectedBlock} · Unit Profiles`}
        subtitle="Rooms with occupancy, residents and complaint counters."
      />
      <ErrorNotice message={error} onRetry={load} />

      <View style={styles.backRow}>
        <Button
          title="← All Blocks"
          size="sm"
          variant="ghost"
          onPress={() => setSelectedBlock("")}
        />
      </View>

      <TextField
        label="Search units"
        value={term}
        onChangeText={setTerm}
        placeholder="Room number, room letter, resident name…"
        autoCapitalize="none"
      />
      <OptionPicker
        label="Status"
        value={status}
        options={STATUS_FILTER_OPTIONS}
        onChange={setStatus}
        placeholder="All"
        modalTitle="Filter by status"
      />

      <SectionTitle>{`${cards.length} room${cards.length === 1 ? "" : "s"}`}</SectionTitle>

      {cards.length === 0 ? (
        <EmptyState message="No units match your criteria." />
      ) : (
        cards.map((card) => {
          const anyOccupied = card.occupiedCount > 0;
          return (
            <Card key={card.roomId} style={styles.unitCard}>
              <View style={styles.unitHead}>
                <Text style={styles.unitLabel}>{card.label}</Text>
                <OccupancyChip
                  occupied={anyOccupied}
                  label={
                    anyOccupied
                      ? `${card.occupiedCount}/${card.units.length} Occupied`
                      : "Available"
                  }
                />
              </View>

              <View style={styles.chips}>
                {card.subRooms.map(({ letter, slots }) => {
                  const occupiedCount = slots.filter((slot) => slot.occupied === true).length;
                  return (
                    <OccupancyChip
                      key={`${card.roomId}-${letter}`}
                      occupied={occupiedCount > 0}
                      label={`Room ${letter} — ${occupiedCount}/${slots.length}`}
                    />
                  );
                })}
              </View>

              <View style={styles.unitFoot}>
                <View style={styles.countBadges}>
                  <Badge
                    bg={colors.status.Submitted.bg}
                    fg={colors.status.Submitted.fg}
                  >
                    {`${card.complaintCount} complaint${card.complaintCount === 1 ? "" : "s"}`}
                  </Badge>
                  <Badge bg={colors.status["In Progress"].bg} fg={colors.status["In Progress"].fg}>
                    {`${card.activeCount} active`}
                  </Badge>
                </View>
                <Button
                  title="View Profile"
                  size="sm"
                  accessibilityLabel={`View room profile ${card.label}`}
                  onPress={() => navigation.navigate("RoomProfile", { roomId: card.roomId })}
                />
              </View>
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  blockGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  blockCard: {
    flexGrow: 1,
    minWidth: "45%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  blockCardPressed: { opacity: 0.85, borderColor: colors.primary },
  blockName: { fontSize: typography.h3, fontWeight: "700", color: colors.primary },
  blockMeta: { fontSize: typography.small, color: colors.textMuted },
  blockCta: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.accentDark,
  },
  backRow: { marginBottom: spacing.md },
  unitCard: { paddingVertical: spacing.md },
  unitHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  unitLabel: { flex: 1, fontSize: typography.h3, fontWeight: "700", color: colors.text },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  unitFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: "wrap",
  },
  countBadges: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
});

