/** Dinamic Operations — source of truth for Mantine theme. */
export const designTokens = {
  colors: {
    /** Structural ink / trust (nav, headings). */
    ink: "#0F1E2B",
    inkHover: "#0C1721",
    inkLight: "#E9ECEF",
    /** CTA, focus, accent (not large surfaces). */
    accent: "#FF6A00",
    accentHover: "#E55F00",
    accentLight: "#FFF4EB",
    secondary: "#6B7785",
    secondaryLight: "#F4F6F8",
    neutral: "#6B7785",
    background: "#F7F8F9",
    surface: "#FFFFFF",
    border: "#E9ECEF",
    textPrimary: "#0F1E2B",
    textSecondary: "#6B7785",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    info: "#0284C7",
    /** Recommendations / IA — integrated slate (Mantine `ai` scale). */
    ai: "#3D5160",
    aiHover: "#2A3A47",
    aiLight: "#F4F6F8",
    aiBorder: "#E9ECEF",
    aiMuted: "#6B7785",
    /** @deprecated Use `accent` — kept for gradual migration of direct token reads. */
    primary: "#FF6A00",
    primaryHover: "#E55F00",
    primaryLight: "#FFF4EB",
    tertiary: "#FF6A00",
    tertiaryLight: "#FFF4EB",
  },
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
  },
  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  shadows: {
    sm: "0 1px 2px rgba(15, 30, 43, 0.06)",
    md: "0 4px 12px rgba(15, 30, 43, 0.08)",
  },
} as const;
