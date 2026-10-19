/**
 * components/DateField.js
 * ------------------------------------------------------------------
 * Mobile equivalent of the website's <input type="date"> used for the
 * estimated / actual completion dates in the management modal.
 *
 * Behaviour parity:
 *   - the stored value is a JS Date written as `new Date(`${iso}T00:00:00`)`
 *     (see fromDateInputValue in utils/dates.js),
 *   - the field can be CLEARED, which writes null exactly like submitting
 *     an empty web date input,
 *   - on Android the native dialog is used; on iOS the picker is shown
 *     inline inside a small sheet.
 */

import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, layout, radius, spacing, typography } from "../theme";
import { toDateInputValue } from "../utils/dates";

export default function DateField({
  label,
  value,
  onChange,
  disabled = false,
  placeholder = "Not set",
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [draft, setDraft] = useState(value || new Date());

  const display = value ? toDateInputValue(value) : placeholder;

  const openPicker = () => {
    if (disabled) return;
    setDraft(value || new Date());
    setShowPicker(true);
  };

  const commit = (date) => {
    setShowPicker(false);
    if (date) onChange?.(date);
  };

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={openPicker}
        style={[styles.control, disabled && styles.controlDisabled]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
      >
        <Text style={value ? styles.valueText : styles.placeholderText}>{display}</Text>
        <Text style={styles.icon}>📅</Text>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          onPress={() => onChange?.(null)}
          disabled={disabled || !value}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label}`}
        >
          <Text style={[styles.clear, (disabled || !value) && styles.clearDisabled]}>
            Clear
          </Text>
        </Pressable>
      </View>

      {showPicker && Platform.OS === "android" ? (
        <DateTimePicker
          value={draft}
          mode="date"
          display="default"
          onChange={(event, date) => {
            if (event?.type === "dismissed") {
              setShowPicker(false);
              return;
            }
            commit(date);
          }}
        />
      ) : null}

      {Platform.OS !== "android" ? (
        <Modal
          visible={showPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPicker(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setShowPicker(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <DateTimePicker
              value={draft}
              mode="date"
              display="spinner"
              onChange={(event, date) => date && setDraft(date)}
            />
            <Pressable style={styles.sheetButton} onPress={() => commit(draft)}>
              <Text style={styles.sheetButtonText}>Done</Text>
            </Pressable>
          </View>
        </Modal>
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
  controlDisabled: { backgroundColor: "#eef1f5" },
  valueText: { color: colors.text, fontSize: typography.body },
  placeholderText: { color: colors.textMuted, fontSize: typography.body },
  icon: { fontSize: typography.body },
  actions: { flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.xs },
  clear: { color: colors.danger, fontWeight: "600", fontSize: typography.small },
  clearDisabled: { color: colors.borderStrong },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  sheetTitle: {
    fontSize: typography.h3,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  sheetButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  sheetButtonText: { color: "#ffffff", fontWeight: "700" },
});
