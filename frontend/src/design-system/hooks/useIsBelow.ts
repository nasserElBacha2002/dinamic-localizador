import { useMediaQuery } from "@mantine/hooks";
import { maxWidthBelow, type BreakpointName } from "../theme/breakpoints";

/**
 * True when the viewport is strictly below the given Mantine breakpoint.
 * Prefer CSS / Mantine `hiddenFrom`/`visibleFrom` when possible; use this only
 * when a single interactive tree must switch (e.g. DataTable cards vs table).
 */
export function useIsBelow(breakpoint: BreakpointName = "sm"): boolean {
  return useMediaQuery(maxWidthBelow(breakpoint), false, {
    getInitialValueInEffect: false,
  }) ?? false;
}
