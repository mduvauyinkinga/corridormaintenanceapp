/**
 * screens/auth/RegisterScreen.js
 * ------------------------------------------------------------------
 * Port of register.html + js/register.js:
 *   - full name, student number, TUT email (@tut4life.ac.za only),
 *     password (min 6 chars) and password confirmation,
 *   - creates the resident account on the backend (POST /auth/register),
 *   - creates users/{uid} with { uid, name, studentNumber, email (lower),
 *     role: "resident", roomId: null, unitId: null, createdAt },
 *   - the navigator then routes to the "Choose Your Room" flow, exactly
 *     like the website's redirect to choose-room.html.
 */

import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import Button from "../../components/Button";
import { Card } from "../../components/Layout";
import { FormAlert } from "../../components/States";
import TextField from "../../components/TextField";
import { ALLOWED_DOMAIN } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { colors, spacing, typography } from "../../theme";
import { getErrorMessage } from "../../utils/errors";
import { validateRegistration } from "../../utils/validation";

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    fullName: "",
    studentNumber: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async () => {
    setFormError("");
    const validation = validateRegistration(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      await register(form);
      // AuthProvider refreshes the profile; the navigator shows Choose Room.
    } catch (error) {
      console.error("[RegisterScreen] registration failed:", error);
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          Create your resident account to join your room and report maintenance issues.
        </Text>

        <Card>
          <FormAlert message={formError} />

          <TextField
            label="Full name"
            required
            value={form.fullName}
            onChangeText={update("fullName")}
            error={errors.fullName}
            placeholder="e.g. Mzimba Mahlangu"
            autoCapitalize="words"
            autoComplete="name"
          />

          <TextField
            label="Student number"
            required
            value={form.studentNumber}
            onChangeText={update("studentNumber")}
            error={errors.studentNumber}
            placeholder="e.g. 223456789"
            keyboardType="number-pad"
            autoCapitalize="none"
          />

          <TextField
            label="Email"
            required
            value={form.email}
            onChangeText={update("email")}
            error={errors.email}
            hint={`Must end with ${ALLOWED_DOMAIN}`}
            placeholder="you@tut4life.ac.za"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <TextField
            label="Password"
            required
            value={form.password}
            onChangeText={update("password")}
            error={errors.password}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
          />

          <TextField
            label="Confirm password"
            required
            value={form.confirmPassword}
            onChangeText={update("confirmPassword")}
            error={errors.confirmPassword}
            placeholder="Re-enter your password"
            secureTextEntry
            autoCapitalize="none"
            onSubmitEditing={handleSubmit}
          />

          <Button
            title="Create Account"
            onPress={handleSubmit}
            loading={submitting}
            loadingText="Creating account…"
            fullWidth
          />
        </Card>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            Only {ALLOWED_DOMAIN} student email addresses can register, and you must be
            a resident of Corridor Hill to claim a room.
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
  noteBox: {
    backgroundColor: "#eef3f8",
    borderRadius: 8,
    padding: spacing.md,
  },
  noteText: { color: colors.textMuted, fontSize: typography.small },
});
