import type { AbsenceDayBreakdownItem } from "./absence-day-breakdown.types";
import { splitAbsenceQuantityByYear } from "./absence-balance-year-split";

export type { AbsenceDayBreakdownItem };
export type YearAllocation = {
  year: number;
  quantity: number;
};

/**
 * Aggregate counted day fractions from calendar breakdown by calendar year.
 * Preferred source for ledger allocations when breakdown is available.
 */
export const allocationsByYearFromBreakdown = (
  breakdown: AbsenceDayBreakdownItem[],
): YearAllocation[] => {
  const byYear = new Map<number, number>();
  for (const item of breakdown) {
    if (!item.counted || item.counted <= 0) {
      continue;
    }
    const year = Number.parseInt(item.date.slice(0, 4), 10);
    if (!Number.isFinite(year)) {
      continue;
    }
    byYear.set(year, Number(((byYear.get(year) ?? 0) + item.counted).toFixed(1)));
  }
  return [...byYear.entries()]
    .map(([year, quantity]) => ({ year, quantity }))
    .filter((row) => row.quantity > 0)
    .sort((a, b) => a.year - b.year);
};

/**
 * Resolve year allocations for ledger.
 * Prefer persisted/calendar breakdown. Legacy fallback is approximate proportional split.
 */
export const resolveYearAllocations = (input: {
  breakdown?: AbsenceDayBreakdownItem[] | null;
  persistedJson?: string | null;
  startDate: string;
  endDate: string;
  totalDays: number;
}): { allocations: YearAllocation[]; source: "BREAKDOWN" | "PERSISTED" | "LEGACY_APPROXIMATE" } => {
  if (input.persistedJson) {
    try {
      const parsed = JSON.parse(input.persistedJson) as YearAllocation[];
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (row) =>
            row &&
            typeof row.year === "number" &&
            typeof row.quantity === "number" &&
            row.quantity > 0,
        )
      ) {
        return { allocations: parsed, source: "PERSISTED" };
      }
    } catch {
      /* fall through */
    }
  }

  if (input.breakdown && input.breakdown.length > 0) {
    const allocations = allocationsByYearFromBreakdown(input.breakdown);
    if (allocations.length > 0) {
      return { allocations, source: "BREAKDOWN" };
    }
  }

  return {
    allocations: splitAbsenceQuantityByYear({
      startDate: input.startDate,
      endDate: input.endDate,
      totalDays: input.totalDays,
    }),
    source: "LEGACY_APPROXIMATE",
  };
};
