import { createTheme, type MantineColorsTuple } from "@mantine/core";
import { designTokens } from "./tokens";

const brand: MantineColorsTuple = [
  "#eff6ff",
  "#dbeafe",
  "#bfdbfe",
  "#93c5fd",
  "#60a5fa",
  "#3b82f6",
  designTokens.colors.primary,
  "#1d4ed8",
  "#1e40af",
  "#1e3a8a",
];

const success: MantineColorsTuple = [
  "#f0fdf4",
  "#dcfce7",
  "#bbf7d0",
  "#86efac",
  "#4ade80",
  "#22c55e",
  designTokens.colors.success,
  "#15803d",
  "#166534",
  "#14532d",
];

const danger: MantineColorsTuple = [
  "#fef2f2",
  "#fee2e2",
  "#fecaca",
  "#fca5a5",
  "#f87171",
  "#ef4444",
  designTokens.colors.danger,
  "#b91c1c",
  "#991b1b",
  "#7f1d1d",
];

const warning: MantineColorsTuple = [
  "#fffbeb",
  "#fef3c7",
  "#fde68a",
  "#fcd34d",
  "#fbbf24",
  "#f59e0b",
  designTokens.colors.warning,
  "#d97706",
  "#b45309",
  "#92400e",
];

export const mantineTheme = createTheme({
  primaryColor: "brand",
  colors: {
    brand,
    success,
    danger,
    warning,
  },
  fontFamily: designTokens.fontFamily,
  headings: {
    fontFamily: designTokens.fontFamily,
    fontWeight: "600",
  },
  defaultRadius: "md",
  spacing: designTokens.spacing,
  shadows: {
    xs: designTokens.shadows.sm,
    sm: designTokens.shadows.sm,
    md: designTokens.shadows.md,
    lg: designTokens.shadows.md,
    xl: designTokens.shadows.md,
  },
  white: designTokens.colors.surface,
  black: designTokens.colors.textPrimary,
  components: {
    Button: {
      defaultProps: {
        radius: "md",
      },
    },
    Card: {
      defaultProps: {
        radius: "md",
        withBorder: true,
        padding: "lg",
      },
    },
    Badge: {
      defaultProps: {
        radius: "sm",
        variant: "light",
      },
    },
    Modal: {
      defaultProps: {
        radius: "md",
        overlayProps: { blur: 2 },
      },
    },
    TextInput: {
      defaultProps: {
        radius: "md",
      },
    },
    Select: {
      defaultProps: {
        radius: "md",
      },
    },
    Table: {
      defaultProps: {
        striped: true,
        highlightOnHover: true,
      },
    },
    AppShell: {
      styles: {
        main: {
          backgroundColor: designTokens.colors.background,
        },
        navbar: {
          borderRight: `1px solid ${designTokens.colors.border}`,
        },
        header: {
          borderBottom: `1px solid ${designTokens.colors.border}`,
          backgroundColor: designTokens.colors.surface,
        },
      },
    },
  },
});
