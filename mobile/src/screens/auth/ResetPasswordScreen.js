/**
 * screens/auth/ResetPasswordScreen.js
 * ------------------------------------------------------------------
 * Mobile port of reset-password.html:
 *   1. Receives a reset token via navigation params (?token=xxx from the
 *      email link, or passed programmatically),
 *   2. validates new password + confirmation,
 *   3. POST /auth/reset-password to set the new password.
 */
import React, { useState, useEffect } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import Button from "../../components/Button";
import { Card, SectionTitle } from "../../components/Layout";
import { FormAlert } from "../../components/States";
import TextField from "../../components/TextField";
import { useAuth } from "../../context/AuthContext";
import { colors, spacing, typography } from "../../theme";
import { getErrorMessage } from "../../utils/errors";

export default function ResetPasswordScreen({ navigation, route }) {
  const tokenFromParams = route.params?.token || "";
  const [token, setToken] = useState(tokenFromParams);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(tokenFromParams);
  }, [tokenFromParams]);

  const handleSubmit = async () => {
    setFormError("");
    const validation = {};
    if (!token) {
      formError = "No reset token. Please request a new reset link.";
      setErrors({});
      return;
    }
    if (!password || password.length < 8) {
      validation.password = "Password must be at least 8 characters.";
    }
    if (!confirmPassword) {
      validation.confirmPassword = "Please confirm your password.";
    } else if (confirmPassword !== password) {
      validation.confirmPassword = "Passwords do not match.";
    }
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const { resetPassword } = await import("../../services/authService");
      await resetPassword(token, password);
      setDone(true);
    } catch (error) {
      console.error("[ResetPasswordScreen] failed:", error);
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <SectionTitle>Password reset</SectionTitle>
          <Text style={styles.subtitle}>
            Your new password is now active. You can sign in with it.
          </Text>

          <Card style={styles.card}>
            <FormAlert
              message="Your password has been reset successfully."
              type="success"
            />
          </Card>

          <Button
            title="Go to Login"
            onPress={() => navigation.navigate("Login")}
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
        <SectionTitle>Reset password</SectionTitle>
        <Text style={styles.subtitle}>
          Set a new password for your account.
        </Text>

        {!token && (
          <Card>
            <FormAlert
              message="No reset token provided. Please request a new reset link from the login screen."
              type="error"
            />
          </Card>
        )}

        <Card>
          <FormAlert message={formError} />

          <TextField
            label="New Password"
            required
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            returnKeyType="next"
            onSubmitEditing={() => null}
          />

          <TextField
            label="Confirm Password"
            required
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            error={errors.confirmPassword}
            placeholder="Re-enter your password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <Button
            title="Reset Password"
            onPress={handleSubmit}
            loading={submitting}
            loadingText="Resetting…"
            fullWidth
            disabled={!token}
          />
        </Card>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Remember your password? </Text>
          <Text style={styles.link} onPress={() => navigation.navigate("Login")}>
            Sign in
          </Text>
        </View>
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
