/**
 * context/ToastContext.js
 * ------------------------------------------------------------------
 * Mobile equivalent of the website's toast helper (js/utils.js `toast`).
 *
 * The same four message types are supported (info / success / error /
 * warning) and messages auto-dismiss, so feedback feels identical on both
 * clients. Rendered as a safe-area aware banner so it never collides with
 * the status bar or the tab bar.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typography } from "../theme";

const ToastContext = createContext(null);

const TYPE_COLORS = {
  success: colors.success,
  error: colors.danger,
  warning: colors.warning,
  info: colors.info,
};

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(
      () => setToast(null)
    );
  }, [opacity]);

  /** showToast(message, type = "info", duration = 3500) — js/utils.js parity. */
  const showToast = useCallback(
    (message, type = "info", duration = 3500) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ message, type });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timerRef.current = setTimeout(hide, duration);
    },
    [hide, opacity]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              opacity,
              bottom: insets.bottom + 72,
              borderLeftColor: TYPE_COLORS[toast.type] || colors.info,
            },
          ]}
        >
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

/** Access the toast API. */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  text: {
    color: "#ffffff",
    fontSize: typography.body,
    fontWeight: "600",
  },
});
