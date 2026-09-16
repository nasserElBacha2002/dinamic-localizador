import type { OperationShiftVersion } from "../types/operation-shift";
import { getTodayDateInput } from "./dates";

/**
 * Version whose inclusive effective range covers refDate:
 * effectiveFrom <= refDate AND (effectiveUntil IS NULL OR refDate <= effectiveUntil).
 */
export function resolveCurrentShiftVersion(
  versions: readonly OperationShiftVersion[],
  refDate: string = getTodayDateInput(),
): OperationShiftVersion | null {
  const matches = versions.filter((version) => {
    if (version.effectiveFrom > refDate) {
      return false;
    }
    if (version.effectiveUntil != null && refDate > version.effectiveUntil) {
      return false;
    }
    return true;
  });

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    return [...matches].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]!;
  }
  return matches[0]!;
}

export type PartitionedShiftVersions = {
  current: OperationShiftVersion | null;
  upcoming: OperationShiftVersion[];
  past: OperationShiftVersion[];
};

/** Splits versions relative to the operational refDate (YYYY-MM-DD). */
export function partitionShiftVersions(
  versions: readonly OperationShiftVersion[],
  refDate: string = getTodayDateInput(),
): PartitionedShiftVersions {
  const current = resolveCurrentShiftVersion(versions, refDate);
  const upcoming = versions
    .filter((version) => version.effectiveFrom > refDate)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const past = versions
    .filter((version) => {
      if (current && version.id === current.id) {
        return false;
      }
      if (version.effectiveFrom > refDate) {
        return false;
      }
      return version.effectiveUntil != null && version.effectiveUntil < refDate;
    })
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  return { current, upcoming, past };
}
