import { designTokens } from "./tokens";

/** Shared ECharts / analytics palette (Dinamic Operations). */
export const chartColors = {
  ink: designTokens.colors.ink,
  secondary: designTokens.colors.secondary,
  accent: designTokens.colors.accent,
  present: designTokens.colors.success,
  absent: designTokens.colors.danger,
  justified: designTokens.colors.secondary,
  expected: designTokens.colors.info,
  late: designTokens.colors.warning,
  warning: designTokens.colors.warning,
  outsideGeofence: "#5A6570",
  pendingReview: designTokens.colors.ink,
  rejected: "#5A6570",
  primary: designTokens.colors.ink,
  volume: designTokens.colors.border,
  grid: designTokens.colors.border,
  axis: designTokens.colors.textSecondary,
} as const;
