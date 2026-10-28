/**
 * components/TextField.js
 * ------------------------------------------------------------------
 * Labelled text input with the website's form conventions:
 *   - required marker,
 *   - inline field error under the input (form__error in the web CSS),
 *   - hint text (form__hint),
 *   - password visibility toggle (mobile equivalent of typing in a browser
 *     password field without a hardware keyboard).
 */

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, layout, radius, spacing, typography } from "../theme";

export default function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  required = false,
  error = "",
  hint = "",
  keyboardType = "default",
  autoCapitalize = "sentences",
  autoComplete,
  multiline = false,
  numberOfLines,
  maxLength,
  editable = true,
  onSubmitEditing,
  returnKeyType,
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={styles.group}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <View style={styles.inputWrap}>
        <TextInput
          style={[
            styles.input,
            multiline && styles.inputMultiline,
            error ? styles.inputInvalid : null,
            !editable && styles.inputDisabled,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword && !revealed}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={false}
          multiline={multiline}
          numberOfLines={numberOfLines}
          maxLength={maxLength}
          editable={editable}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          accessibilityLabel={label || placeholder}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setRevealed((current) => !current)}
            style={styles.reveal}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={8}
          >
            <Text style={styles.revealText}>{revealed ? "Hide" : "Show"}</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.danger,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: layout.minTouch,
  },
  input: {
    flex: 1,
    fontSize: typography.body,
    color: colors.text,
    paddingVertical: spacing.md,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
  inputDisabled: {
    backgroundColor: "#eef1f5",
    color: colors.textMuted,
  },
  reveal: {
    paddingLeft: spacing.sm,
  },
  revealText: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: typography.small,
  },
  error: {
    marginTop: spacing.xs,
    color: colors.danger,
    fontSize: typography.small,
  },
  hint: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.small,
  },
});
