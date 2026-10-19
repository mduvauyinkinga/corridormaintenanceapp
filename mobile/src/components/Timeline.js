/**
 * components/Timeline.js
 * ------------------------------------------------------------------
 * Complaint lifecycle history — port of `renderTimeline()` in
 * js/timeline.js: an ordered list of events with the action, description
 * and "author · date-time" meta line.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "../theme";
import { formatDateTime } from "../utils/dates";

export default function Timeline({ events = [], emptyMessage = "No timeline events yet." }) {
  if (!events.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View>
      {events.map((event, index) => (
        <View key={event.id || `${index}-${event.createdAt || ""}`} style={styles.row}>
          <View style={styles.rail}>
            <View style={styles.dot} />
            {index < events.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <View style={styles.content}>
            <Text style={styles.action}>{event.action || "Update"}</Text>
            {event.description ? (
              <Text style={styles.description}>{event.description}</Text>
            ) : null}
            <Text style={styles.meta}>
              {`${event.authorName || "System"} · ${formatDateTime(event.createdAt)}`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  rail: { width: 20, alignItems: "center" },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginTop: 5,
  },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  content: { flex: 1, paddingBottom: spacing.lg, paddingLeft: spacing.sm },
  action: { fontSize: typography.body, fontWeight: "700", color: colors.text },
  description: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.small,
  },
  meta: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.tiny,
  },
  emptyBox: { padding: spacing.lg, backgroundColor: "#f4f6f9", borderRadius: 8 },
  emptyText: { color: colors.textMuted, fontSize: typography.small },
});
