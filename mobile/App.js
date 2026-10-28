/**
 * App.js
 * ------------------------------------------------------------------
 * Root component of the Corridor Hill mobile client.
 *
 * Provider order matters:
 *   SafeAreaProvider → ToastProvider → AuthProvider → RootNavigator
 *
 * AuthProvider owns the Firebase Auth subscription; RootNavigator renders
 * the role-appropriate branch (public / choose-room / resident /
 * management) using the same rules as the website.
 */

import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "./src/context/AuthContext";
import { ToastProvider } from "./src/context/ToastContext";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
