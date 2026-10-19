/**
 * screens/management/ResidentsScreen.js
 * ------------------------------------------------------------------
 * The Residents tab — port of `#view-residents` + renderResidents() in
 * js/management.js.
 *
 * One bulk users/rooms/units/complaints read (loadManagementData) is
 * cached in screen state; the search filter and the per-resident
 * complaint counter are then derived in memory, exactly like the
 * website. Each card shows the resident's name, "student number · Block ·
 * Room", email and their complaint count badge.
 */

import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Badge } from "../../components/Badges";
import { Card, ScreenTitle, SectionTitle } from "../../components/Layout";
import TextField from "../../components/TextField";
import { EmptyState, ErrorNotice, LoadingState } from "../../components/States";
import { loadManagementData } from "../../services/managementService";
import { colors, spacing, typography } from "../../theme";
import { getErrorMessage } from "../../utils/errors";

export default function ResidentsScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [term, setTerm] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await loadManagementData());
    } catch (loadError) {
      console.error("[ResidentsScreen] load error:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const residents = useMemo(() => {
    if (!data) return [];
    const needle = term.trim().toLowerCase();

    const counts = {};
    data.complaints.forEach((complaint) => {
      counts[complaint.residentId] = (counts[complaint.residentId] || 0) + 1;
    });

    const list = Object.values(data.usersMap).filter(
      (user) => user.role === "resident"
    );

    const resolved = list.map((resident) => {
      const unit = resident.unitId ? data.unitsMap[resident.unitId] : null;
      const room = resident.roomId ? data.roomsMap[resident.roomId] : null;
      const block = unit?.block || room?.block || "—";
      const roomNumber = unit?.roomNumber ?? room?.roomNumber ?? "—";
      const roomLetter = unit?.roomLetter || unit?.unitName || "—";
      return {
        uid: resident.uid,
        name: resident.name || "Unnamed",
        studentNumber: resident.studentNumber || "—",
        email: resident.email || "",
        meta: `Block ${block} · Room ${roomNumber}${roomLetter}`,
        count: counts[resident.uid] || 0,
        haystack: [
          resident.name,
          resident.studentNumber,
          resident.email,
          block,
          String(roomNumber),
          roomLetter,
        ]
          .join(" ")
          .toLowerCase(),
      };
    });

    return needle
      ? resolved.filter((resident) => resident.haystack.includes(needle))
      : resolved;
  }, [data, term]);

  if (loading) return <LoadingState message="Loading residents…" />;

  return (
    <FlatList
      data={residents}
      keyExtractor={(item) => item.uid}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <View>
          <ScreenTitle
            title="Residents"
            subtitle="Everyone registered at Corridor Hill."
          />
          <ErrorNotice message={error} onRetry={load} />
          <TextField
            label="Search"
            value={term}
            onChangeText={setTerm}
            placeholder="Name, student number, room…"
            autoCapitalize="none"
          />
          <SectionTitle>{`${residents.length} resident${
            residents.length === 1 ? "" : "s"
          }`}</SectionTitle>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          message={
            term
              ? "No residents match your search."
              : "No residents registered yet."
          }
        />
      }
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardInfo}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{`${item.studentNumber} · ${item.meta}`}</Text>
              {item.email ? <Text style={styles.email}>{item.email}</Text> : null}
            </View>
            <Badge
              bg={colors.status.Submitted.bg}
              fg={colors.status.Submitted.fg}
            >
              {`${item.count} complaint${item.count === 1 ? "" : "s"}`}
            </Badge>
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: { paddingVertical: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  cardInfo: { flex: 1 },
  name: { fontSize: typography.body, fontWeight: "700", color: colors.text },
  meta: { marginTop: 2, fontSize: typography.small, color: colors.textMuted },
  email: { marginTop: 2, fontSize: typography.small, color: colors.primary },
});
