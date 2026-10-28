/**
 * screens/auth/LandingScreen.js
 * ------------------------------------------------------------------
 * Public landing screen — the mobile version of index.html.
 *
 * It keeps the website's content and information hierarchy (hero, feature
 * list, "ready to get started" call to action) and its branding, presented
 * as a scrollable phone screen with two primary actions: Register / Login.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "../../components/Button";
import { Card, SectionTitle } from "../../components/Layout";
import { BRAND, FEATURES, LOGO } from "../../config/branding";
import { colors, radius, spacing, typography } from "../../theme";

export default function LandingScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
    >
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        <Image source={LOGO} style={styles.logo} accessibilityLabel="Corridor Hill logo" />
        <Text style={styles.brand}>{BRAND.name}</Text>
        <Text style={styles.title}>Report Maintenance Issues at Corridor Hill</Text>
        <Text style={styles.lead}>{BRAND.tagline}</Text>

        <View style={styles.actions}>
          <Button
            title="Create an account"
            variant="accent"
            fullWidth
            onPress={() => navigation.navigate("Register")}
          />
          <Button
            title="Login"
            variant="ghost"
            fullWidth
            style={styles.loginButton}
            onPress={() => navigation.navigate("Login")}
          />
        </View>
      </View>

      <View style={styles.body}>
        <SectionTitle>What you can do</SectionTitle>
        {FEATURES.map((feature) => (
          <Card key={feature.title} style={styles.feature}>
            <View style={styles.featureIcon}>
              <Ionicons name={feature.icon} size={20} color={colors.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureBody}>{feature.body}</Text>
            </View>
          </Card>
        ))}

        <Text style={styles.aboutTitle}>About the system</Text>
        <Text style={styles.aboutBody}>
          {BRAND.fullName} connects residents and management to keep every room in
          great condition. Residents join their room, submit issues and follow the
          progress; management reviews, prioritises and resolves every report.
        </Text>
        <Text style={styles.footer}>© {new Date().getFullYear()} {BRAND.fullName}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    alignItems: "center",
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  logo: { width: 72, height: 72, borderRadius: 16 },
  brand: {
    marginTop: spacing.md,
    color: "#ffffff",
    fontWeight: "700",
    fontSize: typography.h3,
  },
  title: {
    marginTop: spacing.md,
    color: "#ffffff",
    fontSize: typography.h1,
    fontWeight: "700",
    textAlign: "center",
  },
  lead: {
    marginTop: spacing.md,
    color: "#cdd9e5",
    fontSize: typography.body,
    textAlign: "center",
  },
  actions: { width: "100%", marginTop: spacing.xl, gap: spacing.md },
  loginButton: { borderColor: "#ffffff", backgroundColor: "rgba(255,255,255,0.08)" },
  body: { padding: spacing.lg },
  feature: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: "#eef3f8",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { flex: 1 },
  featureTitle: { fontWeight: "700", color: colors.text, fontSize: typography.body },
  featureBody: { color: colors.textMuted, fontSize: typography.small, marginTop: 2 },
  aboutTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  aboutBody: { color: colors.textMuted, fontSize: typography.body },
  footer: {
    marginTop: spacing.xl,
    textAlign: "center",
    color: colors.textMuted,
    fontSize: typography.tiny,
  },
});
