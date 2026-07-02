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
  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },
  shadows: {
    sm: "0 1px 2px rgba(15, 23, 42, 0.06)",
    md: "0 4px 12px rgba(15, 23, 42, 0.08)",
  },
} as const;
