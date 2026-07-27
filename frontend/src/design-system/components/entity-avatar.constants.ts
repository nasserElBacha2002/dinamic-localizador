import type { EntityAvatarPaletteEntry } from "./entity-avatar.types";

/**
 * Soft background + readable text pairs using Mantine color CSS variables.
 * Light theme only (project has no dark mode yet).
 */
export const ENTITY_AVATAR_PALETTE: readonly EntityAvatarPaletteEntry[] = [
  {
    background: "var(--mantine-color-blue-1)",
    color: "var(--mantine-color-blue-8)",
  },
  {
    background: "var(--mantine-color-violet-1)",
    color: "var(--mantine-color-violet-8)",
  },
  {
    background: "var(--mantine-color-teal-1)",
    color: "var(--mantine-color-teal-8)",
  },
  {
    background: "var(--mantine-color-cyan-1)",
    color: "var(--mantine-color-cyan-8)",
  },
  {
    background: "var(--mantine-color-indigo-1)",
    color: "var(--mantine-color-indigo-8)",
  },
  {
    background: "var(--mantine-color-grape-1)",
    color: "var(--mantine-color-grape-8)",
  },
  {
    background: "var(--mantine-color-pink-1)",
    color: "var(--mantine-color-pink-8)",
  },
  {
    background: "var(--mantine-color-orange-1)",
    color: "var(--mantine-color-orange-8)",
  },
  {
    background: "var(--mantine-color-lime-1)",
    color: "var(--mantine-color-lime-8)",
  },
  {
    background: "var(--mantine-color-green-1)",
    color: "var(--mantine-color-green-8)",
  },
] as const;

export const ENTITY_AVATAR_FALLBACK_INITIAL = "?";

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
