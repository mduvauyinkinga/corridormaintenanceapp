/**
 * components/Layout.js
 * ------------------------------------------------------------------
 * Small shared layout primitives:
 *   ScreenTitle  — page heading + subtitle (dashboard__header / mgmt header)
 *   Card         — white surface card with the website's radius + shadow
 *   SectionTitle — section heading (the website's .section-title)
 *   Divider      — hairline separator
 *   KeyValue     — label/value row used by detail grids
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, shadow, spacing, typography } from "../theme";

export function ScreenTitle({ title, subtitle, right }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

export function SectionTitle({ children, style }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

export function KeyValue({ label, children, style }) {
  return (
    <View style={[styles.kv, style]}>
      <Text style={styles.kvLabel}>{label}</Text>
      <View style={styles.kvValue}>
        {typeof children === "string" || typeof children === "number" ? (
          <Text style={styles.kvValueText}>{String(children)}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  headerText: { flex: 1, paddingRight: spacing.sm },
  title: {
    fontSize: typography.h1,
    fontWeight: "700",
    color: colors.primary,
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.small,
  },
  sectionTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  kv: { marginBottom: spacing.md },
  kvLabel: {
    fontSize: typography.tiny,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kvValue: { marginTop: 2 },
  kvValueText: { fontSize: typography.body, color: colors.text },
});
