/**
 * screens/shared/SplashScreen.js
 * ------------------------------------------------------------------
 * Shown while the persisted session is resolved (GET /auth/me).
 *
 * This replaces the website's "page load then redirect" behaviour: on the
 * web each page waits for the session to resolve before painting content
 * (js/auth.js guards). On mobile the same wait is expressed as a branded
 * splash so the user never sees a wrong screen flash.
 */

import React from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import { BRAND, LOGO } from "../../config/branding";
import { colors, spacing, typography } from "../../theme";

export default function SplashScreen() {
  return (
    <View style={styles.page}>
      <Image source={LOGO} style={styles.logo} accessibilityLabel="Corridor Hill logo" />
      <Text style={styles.title}>{BRAND.name}</Text>
      <Text style={styles.subtitle}>Residence Maintenance System</Text>
      <ActivityIndicator size="large" color={colors.accent} style={styles.spinner} />
      <Text style={styles.status}>Checking your session…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  logo: { width: 96, height: 96, borderRadius: 20 },
  title: {
    marginTop: spacing.lg,
    color: "#ffffff",
    fontSize: typography.h1,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  spinner: { marginTop: spacing.xxl },
  status: {
    marginTop: spacing.md,
    color: "#cbd7e3",
    fontSize: typography.small,
  },
});
