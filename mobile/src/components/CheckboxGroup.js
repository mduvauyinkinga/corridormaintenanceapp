/**
 * components/CheckboxGroup.js
 * ------------------------------------------------------------------
 * The website's "Select issue(s)" checklist (complaint.html and the edit
 * form in tracking.html) as a touch-friendly multi-select list.
 *
 * Values are the exact issue strings stored in `complaints.issues[]`.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, layout, radius, spacing, typography } from "../theme";

export default function CheckboxGroup({
  label,
  options = [],
  values = [],
  onToggle,
  required = false,
  error = "",
  hint = "",
}) {
  return (
    <View style={styles.group}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <View style={styles.list}>
        {options.map((option) => {
          const checked = values.includes(option);
          return (
            <Pressable
              key={option}
              onPress={() => onToggle?.(option)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={option}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: spacing.lg },
  label: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  required: { color: colors.danger },
  list: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: layout.minTouch,
    paddingHorizontal: spacing.md,
  },
  rowPressed: { backgroundColor: "#f4f6f9" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkMark: {
    color: "#ffffff",
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: typography.small + 3,
  },
  optionText: { flex: 1, color: colors.text, fontSize: typography.body },
  error: { marginTop: spacing.xs, color: colors.danger, fontSize: typography.small },
  hint: { marginTop: spacing.xs, color: colors.textMuted, fontSize: typography.small },
});
