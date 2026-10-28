/**
 * components/Button.js
 * ------------------------------------------------------------------
 * Touch-friendly button with the website's variants:
 *   primary (navy) · accent (gold) · ghost (outlined) · danger
 * plus loading state, which mirrors `setButtonLoading()` in js/utils.js
 * (button disabled + label swapped while the request is in flight).
 */

import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, layout, radius, spacing, typography } from "../theme";

const VARIANTS = {
  primary: { background: colors.primary, border: colors.primary, text: "#ffffff" },
  accent: { background: colors.accent, border: colors.accentDark, text: colors.primaryDark },
  ghost: { background: "transparent", border: colors.primary, text: colors.primary },
  danger: { background: colors.danger, border: colors.danger, text: "#ffffff" },
  subtle: { background: colors.surface, border: colors.border, text: colors.text },
};

export default function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  loadingText = "Please wait…",
  style,
  fullWidth = false,
  accessibilityLabel,
}) {
  const palette = VARIANTS[variant] || VARIANTS.primary;
  const isBlocked = disabled || loading;
  const compact = size === "sm";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: isBlocked, busy: loading }}
      onPress={isBlocked ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.sm : styles.md,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          opacity: isBlocked ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.text} />
      ) : null}
      <Text
        style={[
          styles.label,
          compact && styles.labelSm,
          { color: palette.text },
        ]}
        numberOfLines={1}
      >
        {loading ? loadingText : title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 2,
    borderRadius: radius.sm,
    minHeight: layout.minTouch,
  },
  md: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  sm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 38,
  },
  fullWidth: {
    width: "100%",
  },
  label: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  labelSm: {
    fontSize: typography.small,
  },
});
