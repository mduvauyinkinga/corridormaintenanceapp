/**
 * components/ComplaintCard.js
 * ------------------------------------------------------------------
 * Compact complaint card used by the resident dashboard lists and the
 * "My complaints" list.
 *
 * It shows exactly the same information as the website's
 * `.complaint-card` / tracking table row: category (or "Complaint"),
 * status badge, issue list, priority badge, overdue flag and date — the
 * table is simply re-laid-out as a card because a 9-column table does not
 * work on a phone.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../theme";
import { formatIssues, normalizePriority, normalizeStatus } from "../utils/complaints";
import { formatDate, isOverdue } from "../utils/dates";
import { OverdueBadge, PriorityBadge, StatusBadge } from "./Badges";

export default function ComplaintCard({ complaint, onPress, meta }) {
  const status = normalizeStatus(complaint.status);
  const priority = normalizePriority(complaint.priority);
  const overdue = isOverdue(complaint);

  const content = (
    <>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {complaint.category || "Complaint"}
        </Text>
        <StatusBadge status={status} />
      </View>

      <Text style={styles.meta} numberOfLines={2}>
        {meta || formatIssues(complaint.issues)}
      </Text>

      <View style={styles.badges}>
        <PriorityBadge priority={priority} />
        {overdue ? <OverdueBadge /> : null}
        <Text style={styles.date}>· {formatDate(complaint.createdAt)}</Text>
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.card}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${complaint.category || "Complaint"}, status ${status}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  pressed: { opacity: 0.85 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: typography.h3,
    fontWeight: "700",
    color: colors.text,
  },
  meta: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.small,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  date: { color: colors.textMuted, fontSize: typography.small },
});
