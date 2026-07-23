/**
 * Single source of truth for Mantine breakpoints.
 * Shared with PostCSS via `breakpoints.json` (see `postcss.config.cjs`).
 */
import breakpointsJson from "./breakpoints.json" with { type: "json" };

export const BREAKPOINTS = breakpointsJson;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** CSS max-width query for viewports strictly below a Mantine min-width breakpoint. */
export function maxWidthBelow(breakpoint: BreakpointName): string {
  return `(max-width: calc(${BREAKPOINTS[breakpoint]} - 0.1px))`;
}
