/**
 * screens/auth/LoginScreen.js
 * ------------------------------------------------------------------
 * Port of login.html + js/login.js:
 *   1. validate email (required + email shape) and password (required),
 *   2. sign in against the backend (POST /auth/login) using the shared account,
 *   3. load the signed-in user's profile,
 *   4. hand control back to the navigator which lands the user on the
 *      correct area for their role (management / dashboard / choose room).
 *
 * Login failures show exactly the same human-readable messages as the
 * website (`getErrorMessage`), and the button shows a loading state
 * while the request is in flight.
 */

import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Button from "../../components/Button";
import { Card, SectionTitle } from "../../components/Layout";
import { FormAlert } from "../../components/States";
import TextField from "../../components/TextField";
import { useAuth } from "../../context/AuthContext";
import { colors, spacing, typography } from "../../theme";
import { getErrorMessage } from "../../utils/errors";
import { validateLogin } from "../../utils/validation";

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setFormError("");
    const validation = validateLogin({ email, password });
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      await signIn(email, password);
      // The navigator re-renders into the correct area (website redirect).
    } catch (error) {
      console.error("[LoginScreen] login failed:", error);
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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <SectionTitle>Welcome back</SectionTitle>
        <Text style={styles.subtitle}>Sign in to continue to Corridor Hill.</Text>

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
            returnKeyType="next"
          />

          <TextField
            label="Password"
            required
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            placeholder="Your password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <Button
            title="Login"
            onPress={handleSubmit}
            loading={submitting}
            loadingText="Signing in…"
            fullWidth
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Don&apos;t have an account? </Text>
            <Text style={styles.link} onPress={() => navigation.navigate("Register")}>
              Register
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
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
    flexWrap: "wrap",
  },
  switchText: { color: colors.textMuted, fontSize: typography.small },
  link: { color: colors.primary, fontWeight: "700", fontSize: typography.small },
});
