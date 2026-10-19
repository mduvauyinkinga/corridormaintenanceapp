/**
 * components/NoteList.js
 * ------------------------------------------------------------------
 * Maintenance notes and shared unit updates.
 * Renders the same items as the website's `.note-item` /
 * `.unit-announcement` (text + "Author · date").
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../theme";
import { formatDate } from "../utils/dates";

export default function NoteList({
  notes = [],
  emptyMessage = "No maintenance notes yet.",
  fallbackAuthor = "Management",
}) {
  if (!notes.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {notes.map((note, index) => (
        <View key={note.id || `${index}-${note.createdAt || ""}`} style={styles.item}>
          <Text style={styles.text}>{note.text || note.message || ""}</Text>
          <Text style={styles.meta}>
            {`${note.authorName || fallbackAuthor} · ${formatDate(note.createdAt)}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  item: {
    backgroundColor: "#f7f9fc",
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding: spacing.md,
  },
  text: { color: colors.text, fontSize: typography.body },
  meta: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.tiny,
  },
  emptyBox: {
    padding: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: "#f4f6f9",
  },
  emptyText: { color: colors.textMuted, fontSize: typography.small },
});
