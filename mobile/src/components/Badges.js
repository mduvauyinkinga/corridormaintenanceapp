/**
 * components/Badges.js
 * ------------------------------------------------------------------
 * Status / priority / overdue badges using the SAME colours as the website
 * (css/style.css + css/management.css) and the same normalisation helpers
 * (normalizeStatus / normalizePriority), so a status means the same thing
 * and looks the same in both clients.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../theme";
import { normalizePriority, normalizeStatus } from "../utils/complaints";

/** Generic pill badge. */
export function Badge({ children, bg, fg, style }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.badgeText, { color: fg }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/** Complaint status badge (legacy "Pending" is displayed as "Submitted"). */
export function StatusBadge({ status, style }) {
  const normalised = normalizeStatus(status);
  const palette = colors.status[normalised] || colors.status.Submitted;
  return (
    <Badge bg={palette.bg} fg={palette.fg} style={style}>
      {normalised}
    </Badge>
  );
}

/** Priority badge (unknown/missing priority displays as "Low"). */
export function PriorityBadge({ priority, style }) {
  const normalised = normalizePriority(priority);
  const palette = colors.priority[normalised] || colors.priority.Low;
  return (
    <Badge bg={palette.bg} fg={palette.fg} style={style}>
      {normalised}
    </Badge>
  );
}

/** "Overdue" marker shown when the estimated completion date has passed. */
export function OverdueBadge({ style }) {
  return (
    <Badge bg={colors.overdue.bg} fg={colors.overdue.fg} style={style}>
      Overdue
    </Badge>
  );
}

/** Occupancy chip used by the management occupancy / unit views. */
export function OccupancyChip({ label, occupied, style }) {
  const palette = occupied ? colors.occupiedChip : colors.availableChip;
  return (
    <Badge bg={palette.bg} fg={palette.fg} style={style}>
      {label}
    </Badge>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: typography.tiny,
    fontWeight: "700",
  },
});
