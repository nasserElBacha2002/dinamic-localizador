/** Modern Professional palette — source of truth for Mantine theme. */
export const designTokens = {
  colors: {
    primary: "#1275F2",
    primaryHover: "#0F63D1",
    primaryLight: "#EAF2FF",
    secondary: "#5F78A3",
    secondaryLight: "#EEF3FA",
    tertiary: "#C55B00",
    tertiaryLight: "#FFF3E8",
    neutral: "#74777F",
    background: "#F6F8FC",
    surface: "#FFFFFF",
    border: "#D7DDE8",
    textPrimary: "#101828",
    textSecondary: "#667085",
    success: "#16A34A",
    warning: "#C55B00",
    danger: "#DC2626",
    info: "#1275F2",
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
    sm: "0 1px 2px rgba(16, 24, 40, 0.06)",
    md: "0 4px 16px rgba(16, 24, 40, 0.08)",
  },
} as const;
