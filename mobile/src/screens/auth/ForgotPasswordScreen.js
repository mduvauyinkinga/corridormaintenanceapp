/**
 * screens/auth/ForgotPasswordScreen.js
 * ------------------------------------------------------------------
 * Mobile port of forgot-password.html:
 *   1. validate email (required + email shape),
 *   2. POST /auth/forgot-password to send a reset link,
 *   3. show a confirmation (the link arrives by email; on web it opens
 *      reset-password.html, on mobile the user opens it in a browser).
 */
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, Linking } from "react-native";

import Button from "../../components/Button";
import { Card } from "../../components/Layout";
import { FormAlert } from "../../components/States";
import TextField from "../../components/TextField";
import { useAuth } from "../../context/AuthContext";
import { colors, spacing, typography } from "../../theme";
import { getErrorMessage } from "../../utils/errors";

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    setFormError("");
    const validation = {};
    if (!email.trim()) validation.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      validation.email = "Please enter a valid email address.";
    }
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const { forgotPassword } = await import("../../services/authService");
      await forgotPassword(email.trim());
      setSent(true);
    } catch (error) {
      console.error("[ForgotPasswordScreen] failed:", error);
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const openResetLink = () => {
    // The reset link is delivered by email; this helper just opens the
    // login screen so the user can sign in after resetting via email.
    navigation.navigate("Login");
  };

  if (sent) {
    return (
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <SectionTitle>Reset link sent</SectionTitle>
          <Text style={styles.subtitle}>
            If an account exists for {email}, a password-reset link has been
            sent to that email. Open the link from your email app to set a new
            password. The link expires in 1 hour.
          </Text>

          <Card style={styles.card}>
            <FormAlert
              message="Check your inbox (and spam folder) for the reset email."
              type="info"
            />
          </Card>

          <Button
            title="Back to Login"
            onPress={openResetLink}
            fullWidth
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <SectionTitle>Forgot password</SectionTitle>
        <Text style={styles.subtitle}>
          Enter your email and we&apos;ll send a link to reset your password.
        </Text>

        <Card>
          <FormAlert message={formError} />

          <TextField
            label="Email"
            required
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            placeholder="you@tut4life.ac.za"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <Button
            title="Send Reset Link"
            onPress={handleSubmit}
            loading={submitting}
            loadingText="Sending…"
            fullWidth
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Remember your password? </Text>
            <Text style={styles.link} onPress={() => navigation.navigate("Login")}>
              Sign in
            </Text>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  subtitle: { color: colors.textMuted, marginBottom: spacing.lg },
  card: { marginTop: spacing.lg },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
    flexWrap: "wrap",
  },
  switchText: { color: colors.textMuted, fontSize: typography.small },
  link: { color: colors.primary, fontWeight: "700", fontSize: typography.small },
});
