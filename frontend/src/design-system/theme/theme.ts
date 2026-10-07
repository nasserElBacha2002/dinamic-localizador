import { createTheme, type MantineColorsTuple } from "@mantine/core";
import { BREAKPOINTS } from "./breakpoints";
import { designTokens } from "./tokens";

/** Dark ink — structure, trust, default links on light surfaces. */
const brand: MantineColorsTuple = [
  designTokens.colors.inkLight,
  "#E3E7EB",
  "#CDD4DA",
  "#B4BEC7",
  "#8B98A5",
  designTokens.colors.secondary,
  "#3D5160",
  designTokens.colors.ink,
  designTokens.colors.inkHover,
  "#081018",
];

const secondary: MantineColorsTuple = [
  designTokens.colors.secondaryLight,
  "#E9ECEF",
  "#DDE2E6",
  "#C5CDD4",
  "#A8B2BC",
  "#8B98A5",
  designTokens.colors.secondary,
  "#5A6570",
  "#4A5560",
  "#3A424A",
];

/** Orange accent — primary actions and active nav emphasis. */
const accent: MantineColorsTuple = [
  designTokens.colors.accentLight,
  "#FFE8D6",
  "#FFD4B3",
  "#FFBB85",
  "#FF9A4D",
  "#FF7F1F",
  designTokens.colors.accent,
  designTokens.colors.accentHover,
  "#CC5500",
  "#993F00",
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
  "#b45309",
  "#92400e",
  "#78350f",
];

const gray: MantineColorsTuple = [
  designTokens.colors.background,
  designTokens.colors.inkLight,
  "#E3E7EB",
  designTokens.colors.border,
  "#C5CDD4",
  "#A8B2BC",
  designTokens.colors.neutral,
  "#5A6570",
  "#3D4F5F",
  designTokens.colors.ink,
];

const info: MantineColorsTuple = [
  "#f0f9ff",
  "#e0f2fe",
  "#bae6fd",
  "#7dd3fc",
  "#38bdf8",
  "#0ea5e9",
  designTokens.colors.info,
  "#0369a1",
  "#075985",
  "#0c4a6e",
];

/** Integrated slate for suggestions (not a separate violet product identity). */
const ai: MantineColorsTuple = [
  designTokens.colors.aiLight,
  "#E9ECEF",
  "#DDE2E6",
  "#C5CDD4",
  "#A8B2BC",
  designTokens.colors.aiMuted,
  designTokens.colors.ai,
  designTokens.colors.aiHover,
  "#1F2D38",
  designTokens.colors.ink,
];

export const mantineTheme = createTheme({
  breakpoints: { ...BREAKPOINTS },
  primaryColor: "accent",
  colors: {
    brand,
    secondary,
    accent,
    success,
    danger,
    warning,
    gray,
    info,
    ai,
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
          borderRight: `1px solid ${designTokens.colors.inkLight}`,
          backgroundColor: designTokens.colors.surface,
        },
        header: {
          borderBottom: `1px solid ${designTokens.colors.inkLight}`,
          backgroundColor: designTokens.colors.surface,
          color: designTokens.colors.ink,
        },
      },
    },
  },
});
