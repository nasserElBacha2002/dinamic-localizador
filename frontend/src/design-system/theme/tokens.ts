/** Redesign baseline tokens — source of truth for Mantine theme (PR 1 foundation). */
export const designTokens = {
  colors: {
    primary: "#2563EB",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    border: "#E2E8F0",
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    success: "#16A34A",
    warning: "#F59E0B",
    danger: "#DC2626",
    info: "#0284C7",
  },
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
  },
} as const;
