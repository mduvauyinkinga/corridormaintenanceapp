/**
 * components/RoomSummary.js
 * ------------------------------------------------------------------
 * The website's `.room-summary` strip (Block · Room number · Room letter),
 * reused on the resident dashboard, the complaint form and the profile
 * screen so a resident always sees where their request is coming from.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../theme";

export default function RoomSummary({ block, roomNumber, roomLetter }) {
  const items = [
    { label: "Block", value: block },
    { label: "Room", value: roomNumber },
    { label: "Room letter", value: roomLetter },
  ];

  return (
    <View style={styles.row}>
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <Text style={styles.label}>{item.label}</Text>
          <Text style={styles.value}>{item.value ?? "—"}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  item: { flex: 1, alignItems: "center" },
  label: {
    fontSize: typography.tiny,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  value: {
    marginTop: spacing.xs,
    fontSize: typography.h3,
    fontWeight: "700",
    color: colors.primary,
  },
});
