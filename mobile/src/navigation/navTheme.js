/**
 * navigation/navTheme.js
 * ------------------------------------------------------------------
 * Navigation theming so the app's chrome matches the website's navbar:
 * deep navy (#143c5c) headers, light (#f4f6f9) background, gold accents.
 */

import { DefaultTheme } from "@react-navigation/native";

import { colors, typography } from "../theme";

export const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.primary,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

/** Native-stack screen options shared by every screen. */
export const screenOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: "#ffffff",
  headerTitleStyle: { fontWeight: "700", fontSize: typography.h3 },
  headerBackTitle: "Back",
  contentStyle: { backgroundColor: colors.bg },
};

/** Tab bar styling (navy text, gold active tint — same brand pairing). */
export const tabScreenOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: "#ffffff",
  headerTitleStyle: { fontWeight: "700", fontSize: typography.h3 },
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: {
    borderTopColor: colors.border,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabBarLabelStyle: { fontSize: typography.tiny, fontWeight: "600" },
};
