import type { EntityAvatarPaletteEntry } from "./entity-avatar.types";

/**
 * Soft background + readable text pairs using Mantine CSS variables.
 * Light theme only (project has no dark mode).
 *
 * Contrast (WCAG AA normal text ≥ 4.5:1) validated against `@mantine/core`
 * `DEFAULT_THEME.colors` shade pairs `0` (bg) / `9` (fg) via relative luminance.
 * Replaced orange/lime/green (failed AA at soft shades) with red/gray/dark.
 */
export const ENTITY_AVATAR_PALETTE: readonly EntityAvatarPaletteEntry[] = [
  {
    background: "var(--mantine-color-blue-0)",
    color: "var(--mantine-color-blue-9)",
  },
  {
    background: "var(--mantine-color-violet-0)",
    color: "var(--mantine-color-violet-9)",
  },
  {
    background: "var(--mantine-color-teal-0)",
    color: "var(--mantine-color-teal-9)",
  },
  {
    background: "var(--mantine-color-cyan-0)",
    color: "var(--mantine-color-cyan-9)",
  },
  {
    background: "var(--mantine-color-indigo-0)",
    color: "var(--mantine-color-indigo-9)",
  },
  {
    background: "var(--mantine-color-grape-0)",
    color: "var(--mantine-color-grape-9)",
  },
  {
    background: "var(--mantine-color-pink-0)",
    color: "var(--mantine-color-pink-9)",
  },
  {
    background: "var(--mantine-color-red-0)",
    color: "var(--mantine-color-red-9)",
  },
  {
    background: "var(--mantine-color-gray-0)",
    color: "var(--mantine-color-gray-9)",
  },
  {
    background: "var(--mantine-color-dark-0)",
    color: "var(--mantine-color-dark-9)",
  },
] as const;

/** Brand-tinted pair for company switcher (preserves previous active-company look). */
export const ENTITY_AVATAR_BRAND_TONE: EntityAvatarPaletteEntry = {
  background: "var(--mantine-color-brand-light)",
  color: "var(--mantine-color-brand-7)",
};

export const ENTITY_AVATAR_FALLBACK_INITIAL = "?";

/** Visible title when the entity name is null/empty/whitespace. */
export const ENTITY_IDENTITY_FALLBACK_LABEL = "Sin nombre";

export const ENTITY_AVATAR_SIZE_PX: Record<"xs" | "sm" | "md" | "lg", number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
};

export const ENTITY_AVATAR_FONT_SIZE: Record<"xs" | "sm" | "md" | "lg", string> = {
  xs: "0.6875rem",
  sm: "0.8125rem",
  md: "0.9375rem",
  lg: "1.0625rem",
};
