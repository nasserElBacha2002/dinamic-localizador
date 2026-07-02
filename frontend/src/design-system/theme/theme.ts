import { createTheme, type MantineColorsTuple } from "@mantine/core";
import { designTokens } from "./tokens";

const brand: MantineColorsTuple = [
  designTokens.colors.primaryLight,
  "#D4E6FD",
  "#A8CDFB",
  "#7BB3F8",
  "#4F9AF6",
  "#2680F4",
  designTokens.colors.primary,
  designTokens.colors.primaryHover,
  "#0C52B0",
  "#0A418E",
];

const secondary: MantineColorsTuple = [
  designTokens.colors.secondaryLight,
  "#DDE5F0",
  "#C5D1E3",
  "#AEBDD6",
  "#96A9C9",
  "#7E95BC",
  designTokens.colors.secondary,
  "#4F6585",
  "#3F516A",
  "#2F3D50",
];

const accent: MantineColorsTuple = [
  designTokens.colors.tertiaryLight,
  "#FFE4CC",
  "#FFD1A8",
  "#FFBE85",
  "#FFAB61",
  "#E87400",
  designTokens.colors.tertiary,
  "#A44A00",
  "#833900",
  "#622B00",
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
  designTokens.colors.tertiaryLight,
  "#FFE4CC",
  "#FFD1A8",
  "#FFBE85",
  "#FFAB61",
  "#E87400",
  designTokens.colors.tertiary,
  "#A44A00",
  "#833900",
  "#622B00",
];

const gray: MantineColorsTuple = [
  "#F6F8FC",
  "#EEF1F6",
  "#E2E6EE",
  "#D7DDE8",
  "#C5CBD6",
  "#A8AEB8",
  designTokens.colors.neutral,
  "#5C6068",
  "#43464D",
  "#2B2D32",
];

export const mantineTheme = createTheme({
  primaryColor: "brand",
  colors: {
    brand,
    secondary,
    accent,
    success,
    danger,
    warning,
    gray,
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
  other: {
    background: designTokens.colors.background,
    border: designTokens.colors.border,
    textSecondary: designTokens.colors.textSecondary,
  },
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
    PasswordInput: {
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
