/**
 * Single source of truth for Mantine breakpoints.
 * Must stay aligned with `frontend/postcss.config.cjs` (`mantine-breakpoint-*`).
 */
export const BREAKPOINTS = {
  xs: "36em",
  sm: "48em",
  md: "62em",
  lg: "75em",
  xl: "88em",
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** CSS max-width query for viewports strictly below a Mantine min-width breakpoint. */
export function maxWidthBelow(breakpoint: BreakpointName): string {
  return `(max-width: calc(${BREAKPOINTS[breakpoint]} - 0.1px))`;
}
