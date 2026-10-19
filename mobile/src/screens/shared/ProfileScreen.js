/**
 * screens/shared/ProfileScreen.js
 * ------------------------------------------------------------------
 * The "Account" tab for both roles — the mobile counterpart of the
 * profile information in the website navbar plus its Logout button
 * (js/nav.js + js/auth.js `logout`).
 *
 * Shows:
 *   - name / email / student number / role (the users/{uid} fields),
 *   - the resident's room (block / room / room letter) using the same
 *     profile-first, document-fallback chain as the dashboard,
 *   - the support contact from the website,
 *   - Logout, confirmed with a dialog (the mobile equivalent of the
 *     navbar Logout button).
 *
 * When the profile could not be loaded (e.g. the network dropped while
 * the session was resolving) the screen shows the error plus a Retry
 * action instead of blanking — AuthContext keeps the session, so no
 * re-login is required (the "ProfileScreen Retry" contract noted there).
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";

import Button from "../../components/Button";
import { Card, KeyValue, ScreenTitle, SectionTitle } from "../../components/Layout";
import RoomSummary from "../../components/RoomSummary";
import { ErrorNotice, LoadingState } from "../../components/States";
import { BRAND, LOGO } from "../../config/branding";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { fetchRoom, fetchUnit } from "../../services/roomService";
import { colors, radius, spacing, typography } from "../../theme";

export default function ProfileScreen() {
  const { profile, profileError, uid, refreshProfile, signOut } = useAuth();
  const { showToast } = useToast();

  const [roomInfo, setRoomInfo] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  /* Room labels: denormalised profile fields first, then rooms/units docs. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!profile?.roomId) {
        setRoomInfo(null);
        return;
      }
      if (
        profile.block != null &&
        profile.roomNumber != null &&
        profile.roomLetter != null
      ) {
        setRoomInfo({
          block: profile.block,
          roomNumber: profile.roomNumber,
          roomLetter: profile.roomLetter,
        });
        return;
      }
      try {
        const room = await fetchRoom(profile.roomId);
        const unit = profile.unitId ? await fetchUnit(profile.unitId) : null;
        if (cancelled) return;
        setRoomInfo({
          block: profile.block ?? room?.block ?? null,
          roomNumber: profile.roomNumber ?? room?.roomNumber ?? null,
          roomLetter:
            profile.roomLetter ?? unit?.roomLetter ?? unit?.unitName ?? null,
        });
      } catch (fallbackError) {
        console.warn("[ProfileScreen] room fallback error:", fallbackError);
        if (!cancelled) {
          setRoomInfo({
            block: profile.block ?? null,
            roomNumber: profile.roomNumber ?? null,
            roomLetter: profile.roomLetter ?? null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile]);

  /** Re-read users/{uid} (js/auth.js getUserProfile) without a new login. */
  const handleRetry = useCallback(async () => {
    if (!uid) return;
    setRetrying(true);
    try {
      await refreshProfile(uid);
    } catch (retryError) {
      console.warn("[ProfileScreen] retry failed:", retryError);
      showToast("Could not reload your profile. Please try again.", "error");
    } finally {
      setRetrying(false);
    }
  }, [uid, refreshProfile, showToast]);

  const doSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
      // The navigator switches to the public stack; no navigation needed.
    } catch (signOutError) {
      console.error("[ProfileScreen] sign out error:", signOutError);
      showToast("Could not sign out. Please try again.", "error");
      setSigningOut(false);
    }
  }, [signOut, showToast]);

  /** Navbar Logout on the website; confirmed here because it is disruptive. */
  const confirmSignOut = useCallback(() => {
    Alert.alert(
      "Sign out",
      "Do you want to sign out of Corridor Hill?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: doSignOut },
      ],
      { cancelable: true }
    );
  }, [doSignOut]);

  if (!profile) {
    if (retrying) return <LoadingState message="Reloading your profile…" />;
    return (
      <View style={styles.missing}>
        <ErrorNotice
          message={profileError || "Your profile is not available yet."}
          onRetry={handleRetry}
          retryLabel="Retry"
        />
      </View>
    );
  }

  const roleLabel = profile.role === "management" ? "Management" : "Resident";

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenTitle title="My Account" subtitle={BRAND.fullName} />

      <View style={styles.identity}>
        <Image source={LOGO} style={styles.logo} accessibilityLabel="Corridor Hill logo" />
        <Text style={styles.name}>{profile.name || "—"}</Text>
        <View style={styles.roleChip}>
          <Text style={styles.roleText}>{roleLabel}</Text>
        </View>
      </View>

      <SectionTitle>Account details</SectionTitle>
      <Card>
        <KeyValue label="Full name">{profile.name || "—"}</KeyValue>
        <KeyValue label="Email">{profile.email || "—"}</KeyValue>
        {profile.role === "resident" ? (
          <KeyValue label="Student number">{profile.studentNumber || "—"}</KeyValue>
        ) : null}
        <KeyValue label="Role">{roleLabel}</KeyValue>
      </Card>

      {profile.role === "resident" && profile.roomId ? (
        <>
          <SectionTitle>My room</SectionTitle>
          <RoomSummary
            block={roomInfo?.block ?? "—"}
            roomNumber={roomInfo?.roomNumber ?? "—"}
            roomLetter={roomInfo?.roomLetter ?? "—"}
          />
        </>
      ) : null}

      <SectionTitle>Support</SectionTitle>
      <Card>
        <Text style={styles.supportText}>Need help with the app?</Text>
        <Text style={styles.supportEmail}>{BRAND.supportEmail}</Text>
      </Card>

      <Button
        title="Logout"
        variant="danger"
        fullWidth
        loading={signingOut}
        loadingText="Signing out…"
        onPress={confirmSignOut}
        style={styles.logout}
      />

      <Text style={styles.footer}>
        © {new Date().getFullYear()} {BRAND.fullName}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  missing: { flex: 1, padding: spacing.lg, justifyContent: "center" },
  identity: { alignItems: "center", marginBottom: spacing.xl },
  logo: { width: 84, height: 84, borderRadius: 18 },
  name: {
    marginTop: spacing.md,
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  roleChip: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  roleText: { color: "#ffffff", fontWeight: "700", fontSize: typography.tiny },
  supportText: { color: colors.textMuted, fontSize: typography.small },
  supportEmail: {
    marginTop: spacing.xs,
    color: colors.primary,
    fontWeight: "700",
    fontSize: typography.body,
  },
  logout: { marginTop: spacing.lg },
  footer: {
    marginTop: spacing.xl,
    textAlign: "center",
    color: colors.textMuted,
    fontSize: typography.tiny,
  },
});

