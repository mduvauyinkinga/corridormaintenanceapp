/**
 * components/StatCard.js
 * ------------------------------------------------------------------
 * The website's `.stat-card` (resident dashboard + management overview):
 * a small surface card with a muted label and a prominent value.
 * Rendered two-per-row so statistics stay readable on a phone.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../theme";

export default function StatCard({ label, value, accent = colors.primary }) {
  return (
    <View style={styles.card} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.value, { color: accent }]}>{String(value ?? "—")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.tiny,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: colors.textMuted,
  },
  value: {
    fontSize: typography.h1,
    fontWeight: "700",
  },
});
