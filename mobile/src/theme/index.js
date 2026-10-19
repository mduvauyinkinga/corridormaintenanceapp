/**
 * theme/index.js
 * ------------------------------------------------------------------
 * The mobile design system.
 *
 * Every value here is taken from the EXISTING website so the mobile app
 * keeps the same brand identity and status meanings:
 *   - css/style.css       → :root variables (colours, radii, shadows)
 *   - css/style.css       → .badge--pending / --in-progress / --completed
 *   - css/management.css  → .badge--received / --assigned / --waiting /
 *                           --cancelled / .badge--priority-* / --overdue
 *
 * Colours are intentionally identical hex values to the website so a
 * resident or manager sees the same visual language on both clients.
 */

export const colors = {
  /* Brand palette (css/style.css :root) */
  primary: "#143c5c",
  primaryDark: "#0d2a42",
  accent: "#e8a33d",
  accentDark: "#c9871f",

  /* Neutrals */
  bg: "#f4f6f9",
  surface: "#ffffff",
  text: "#22303c",
  textMuted: "#5c6b7a",
  border: "#dde3ea",
  borderStrong: "#c6d0da",

  /* Status colours */
  success: "#2e9e5b",
  warning: "#e0a024",
  info: "#2f7fd6",
  danger: "#d64545",

  /* Overlays */
  overlay: "rgba(13, 42, 66, 0.55)",

  /* Complaint status badges — mirrors statusBadge() in js/utils.js */
  status: {
    Submitted: { bg: "#fdeeca", fg: "#8a5a00" },
    Received: { bg: "#fef3c7", fg: "#92400e" },
    Assigned: { bg: "#e0e7ff", fg: "#3730a3" },
    "In Progress": { bg: "#dbeafe", fg: "#1d4ed8" },
    "Waiting for Parts": { bg: "#ffe4e6", fg: "#9f1239" },
    Completed: { bg: "#d1fae5", fg: "#065f46" },
    Cancelled: { bg: "#e5e7eb", fg: "#4b5563" },
  },

  /* Priority badges — mirrors priorityBadge() in js/utils.js */
  priority: {
    Low: { bg: "#e2e8f0", fg: "#475569" },
    Medium: { bg: "#fef3c7", fg: "#92400e" },
    High: { bg: "#ffe4e6", fg: "#9f1239" },
    Emergency: { bg: "#7f1d1d", fg: "#ffffff" },
  },

  /* Overdue badge */
  overdue: { bg: "#fde8e8", fg: "#9b1c1c" },

  /* Occupancy chips (css/management.css .occupancy-chip) */
  occupiedChip: { bg: "#ffe4e6", fg: "#9f1239" },
  availableChip: { bg: "#d1fae5", fg: "#065f46" },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
};

export const typography = {
  h1: 24,
  h2: 19,
  h3: 16,
  body: 15,
  small: 13,
  tiny: 11.5,
};

/** Touch targets are kept >= 44pt for reliable mobile interaction. */
export const layout = {
  minTouch: 44,
  screenPadding: spacing.lg,
};

export const shadow = {
  card: {
    elevation: 2,
    shadowColor: "#143c5c",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
};
