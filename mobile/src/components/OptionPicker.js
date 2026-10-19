/**
 * components/OptionPicker.js
 * ------------------------------------------------------------------
 * Touch-friendly replacement for the website's <select> element.
 * Opens a modal list of options — the mobile-appropriate equivalent of a
 * dropdown, and identical option values/casing as the web client so the
 * same Firestore values are written (categories, statuses, priorities,
 * blocks, rooms, sort orders…).
 */

import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, layout, radius, spacing, typography } from "../theme";

/**
 * @param {object[]} options [{ value, label }] — label defaults to value.
 */
export default function OptionPicker({
  label,
  value,
  options = [],
  onChange,
  placeholder = "Select…",
  required = false,
  error = "",
  disabled = false,
  modalTitle,
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.group}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label || placeholder}: ${selected ? selected.label : placeholder}`}
        onPress={() => !disabled && setOpen(true)}
        style={[
          styles.control,
          error ? styles.controlInvalid : null,
          disabled && styles.controlDisabled,
        ]}
      >
        <Text style={selected ? styles.valueText : styles.placeholderText} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{modalTitle || label || "Select"}</Text>
          <FlatList
            data={options}
            keyExtractor={(item) => String(item.value)}
            style={styles.list}
            renderItem={({ item }) => {
              const isSelected = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange?.(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[styles.optionText, isSelected && styles.optionTextSelected]}
                  >
                    {item.label}
                  </Text>
                  {isSelected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No options available.</Text>
            }
          />
          <Pressable style={styles.cancel} onPress={() => setOpen(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
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
  control: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: layout.minTouch,
  },
  controlInvalid: { borderColor: colors.danger },
  controlDisabled: { backgroundColor: "#eef1f5" },
  valueText: { flex: 1, color: colors.text, fontSize: typography.body },
  placeholderText: { flex: 1, color: colors.textMuted, fontSize: typography.body },
  chevron: { color: colors.primary, fontSize: typography.body, marginLeft: spacing.sm },
  error: { marginTop: spacing.xs, color: colors.danger, fontSize: typography.small },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg,
    maxHeight: "70%",
  },
  sheetTitle: {
    fontSize: typography.h3,
    fontWeight: "700",
    color: colors.primary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: { paddingHorizontal: spacing.md },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    minHeight: layout.minTouch,
  },
  optionSelected: { backgroundColor: "#eef3f8" },
  optionPressed: { backgroundColor: "#f4f6f9" },
  optionText: { color: colors.text, fontSize: typography.body },
  optionTextSelected: { color: colors.primary, fontWeight: "700" },
  check: { color: colors.success, fontWeight: "700" },
  emptyText: {
    color: colors.textMuted,
    padding: spacing.lg,
    textAlign: "center",
  },
  cancel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  cancelText: { color: colors.primary, fontWeight: "700", fontSize: typography.body },
});
