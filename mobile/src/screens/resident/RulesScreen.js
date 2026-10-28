/**
 * screens/resident/RulesScreen.js
 * ------------------------------------------------------------------
 * House rules — the mobile counterpart of rules.html (reached from the
 * website's "Rules" navbar tab between "Track Complaints" and Logout).
 *
 * Static content from HOUSE_RULES (mobile/src/config/branding.js),
 * which mirrors the rules.html cards, so both clients show the same
 * six rules.
 */

import React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

import { Card, ScreenTitle } from "../../components/Layout";
import { HOUSE_RULES } from "../../config/branding";
import { spacing, typography } from "../../theme";
import { colors } from "../../theme";

export default function RulesScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenTitle
        title="House Rules"
        subtitle="Welcome to Corridor Hill. Please read and follow these rules."
      />
      {HOUSE_RULES.map((rule) => (
        <Card key={rule.title} style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>{rule.title}</Text>
          <Text style={styles.ruleBody}>{rule.body}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  ruleCard: { paddingVertical: spacing.md },
  ruleTitle: { fontWeight: "700", color: colors.text, fontSize: typography.body },
  ruleBody: { marginTop: 2, color: colors.textMuted, fontSize: typography.small },
});
