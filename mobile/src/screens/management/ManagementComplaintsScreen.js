/**
 * screens/management/ManagementComplaintsScreen.js
 * ------------------------------------------------------------------
 * The Complaints tab of the management console — port of the
 * `#view-complaints` section of management.html + js/management.js:
 *   - the nine overview statistics (renderStats),
 *   - search + status / category / block / floor / date / sort filters
 *     (getFilteredRows),
 *   - the complaint table re-laid-out as cards (renderComplaints) with a
 *     "View" action that opens the details screen (the web modal).
 *
 * Data loading mirrors the website exactly: users, rooms, units and
 * complaints are fetched once per load (page-load equivalent) and every
 * statistic / filter / sort is derived in memory. Orphaned bed slots are
 * released on load just like init() does in js/management.js.
 */

import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { StatusBadge } from "../../components/Badges";
import Button from "../../components/Button";
import DateField from "../../components/DateField";
import { Card, ScreenTitle, SectionTitle } from "../../components/Layout";
import OptionPicker from "../../components/OptionPicker";
import StatCard from "../../components/StatCard";
import TextField from "../../components/TextField";
import { EmptyState, ErrorNotice, LoadingState } from "../../components/States";
import { useToast } from "../../context/ToastContext";
import {
  EMPTY_FILTERS,
  computeStats,
  filterComplaintRows,
  loadManagementData,
  resolveAllRows,
} from "../../services/managementService";
import { releaseOrphanedUnits } from "../../services/roomService";
import { colors, spacing, typography } from "../../theme";
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES } from "../../utils/complaints";
import { formatDate, toDateInputValue } from "../../utils/dates";
import { getErrorMessage } from "../../utils/errors";

/** "All …" option plus one option per value (same option values as the web). */
const withAll = (label, values) => [
  { value: "", label },
  ...values.map((value) => ({ value: String(value), label: String(value) })),
];

const STATUS_OPTIONS = withAll("All statuses", COMPLAINT_STATUSES);
const CATEGORY_OPTIONS = withAll("All categories", COMPLAINT_CATEGORIES);
const BLOCK_OPTIONS = [
  { value: "", label: "All blocks" },
  ...["A", "B", "C", "D", "E", "F"].map((letter) => ({
    value: letter,
    label: `Block ${letter}`,
  })),
];
const FLOOR_OPTIONS = withAll("All floors", [1, 2, 3, 4, 5]);
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "status", label: "Status" },
  { value: "block", label: "Block" },
];

export default function ManagementComplaintsScreen({ navigation }) {
  const { showToast } = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [date, setDate] = useState(null);

  /** The same load sequence as init() in js/management.js. */
  const load = useCallback(async () => {
    setError("");
    try {
      const next = await loadManagementData();
      const released = await releaseOrphanedUnits(
        Object.values(next.unitsMap),
        next.usersMap
      );
      if (released > 0) {
        showToast(
          `${released} bed${released === 1 ? "" : "s"} released because the ` +
            "resident profile was deleted.",
          "success"
        );
      }
      setData(next);
    } catch (loadError) {
      console.error("[ManagementComplaintsScreen] load error:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const setFilter = useCallback((key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const stats = useMemo(() => (data ? computeStats(data) : null), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const resolved = resolveAllRows(data.complaints, data);
    return filterComplaintRows(resolved, {
      ...filters,
      date: date ? toDateInputValue(date) : "",
    });
  }, [data, filters, date]);

  if (loading) return <LoadingState message="Loading management data…" />;

  /* The stats + search + filter block above the list (toolbar parity). */
  const renderHeader = (
    <View>
      <ScreenTitle
        title="Management Dashboard"
        subtitle="Central control panel for residence management."
      />
      <ErrorNotice message={error} onRetry={load} />

      <SectionTitle>Overview statistics</SectionTitle>
      <View style={styles.statsRow}>
        <StatCard label="Total residents" value={stats.residents} />
        <StatCard label="Total rooms" value={stats.rooms} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Occupied rooms" value={stats.occupied} accent={colors.danger} />
        <StatCard label="Available rooms" value={stats.available} accent={colors.success} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Total complaints" value={stats.complaints} />
        <StatCard label="Submitted" value={stats.submitted} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="In progress" value={stats.inProgress} accent={colors.info} />
        <StatCard label="Waiting for parts" value={stats.waiting} accent={colors.warning} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Completed" value={stats.completed} accent={colors.success} />
        <View style={styles.statSpacer} />
      </View>

      <SectionTitle style={styles.spacer}>Search & filters</SectionTitle>
      <TextField
        label="Search"
        value={filters.term}
        onChangeText={(value) => setFilter("term", value)}
        placeholder="Name, student number, block, room…"
        autoCapitalize="none"
      />
      <OptionPicker
        label="Status"
        value={filters.status}
        options={STATUS_OPTIONS}
        onChange={(value) => setFilter("status", value)}
        placeholder="All statuses"
        modalTitle="Filter by status"
      />
      <OptionPicker
        label="Category"
        value={filters.category}
        options={CATEGORY_OPTIONS}
        onChange={(value) => setFilter("category", value)}
        placeholder="All categories"
        modalTitle="Filter by category"
      />
      <OptionPicker
        label="Block"
        value={filters.block}
        options={BLOCK_OPTIONS}
        onChange={(value) => setFilter("block", value)}
        placeholder="All blocks"
        modalTitle="Filter by block"
      />
      <OptionPicker
        label="Floor"
        value={filters.floor}
        options={FLOOR_OPTIONS}
        onChange={(value) => setFilter("floor", value)}
        placeholder="All floors"
        modalTitle="Filter by floor"
      />
      <DateField label="Date submitted" value={date} onChange={setDate} />
      <OptionPicker
        label="Sort"
        value={filters.sort}
        options={SORT_OPTIONS}
        onChange={(value) => setFilter("sort", value)}
        placeholder="Newest"
        modalTitle="Sort complaints"
      />

      <SectionTitle style={styles.spacer}>
        {`${rows.length} complaint${rows.length === 1 ? "" : "s"}`}
      </SectionTitle>
    </View>
  );

  const renderItem = ({ item }) => (
    <Card style={styles.card}>
      <View style={styles.rowHead}>
        <Text style={styles.shortId}>{item.shortId}</Text>
        <StatusBadge status={item.status} />
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {`${item.name} · ${item.studentNumber}`}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {`Block ${item.block} · Room ${item.roomNumber}${item.roomLetter} · ${item.category}`}
      </Text>
      <Text style={styles.meta} numberOfLines={2}>
        {item.issues}
      </Text>
      <View style={styles.cardFoot}>
        <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        <Button
          title="View"
          size="sm"
          variant="ghost"
          accessibilityLabel={`View complaint ${item.shortId}`}
          onPress={() =>
            navigation.navigate("ManageComplaintDetails", {
              complaintId: item.id,
            })
          }
        />
      </View>
    </Card>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={
        <EmptyState message="No complaints match your criteria." />
      }
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  statSpacer: { flex: 1, minWidth: "46%" },
  spacer: { marginTop: spacing.xl },
  card: { paddingVertical: spacing.md },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  shortId: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  name: {
    marginTop: spacing.xs,
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.text,
  },
  meta: { marginTop: 2, fontSize: typography.small, color: colors.textMuted },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  date: { fontSize: typography.small, color: colors.textMuted },
});
