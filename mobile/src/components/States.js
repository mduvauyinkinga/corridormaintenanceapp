/**
 * components/States.js
 * ------------------------------------------------------------------
 * Loading / empty / error states.
 *
 * The website shows a spinner + "Loading complaints…" (table-loading) and
 * inline empty/error text (table-empty). Mobile keeps those messages and
 * adds an explicit Retry action, which matters on flaky mobile networks.
 */

import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../theme";
import Button from "./Button";

export function LoadingState({ message = "Loading…" }) {
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

export function EmptyState({ message, actionLabel, onAction }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="ghost" size="sm" />
      ) : null}
    </View>
  );
}

/** Inline error notice with an optional retry (used instead of alert()). */
export function ErrorNotice({ message, onRetry, retryLabel = "Try again" }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Button title={retryLabel} onPress={onRetry} variant="ghost" size="sm" />
      ) : null}
    </View>
  );
}

/** Form-level alert matching the website's #form-alert region. */
export function FormAlert({ message, type = "error" }) {
  if (!message) return null;
  const palette =
    type === "success"
      ? { bg: "#d1fae5", fg: colors.success }
      : { bg: "#fde8e8", fg: colors.danger };
  return (
    <View style={[styles.alert, { backgroundColor: palette.bg }]} accessibilityRole="alert">
      <Text style={[styles.alertText, { color: palette.fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: typography.small,
  },
  emptyBox: {
    padding: spacing.xl,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: typography.body,
  },
  errorBox: {
    backgroundColor: "#fde8e8",
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: typography.small, fontWeight: "600" },
  alert: {
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  alertText: { fontSize: typography.small, fontWeight: "600" },
});
