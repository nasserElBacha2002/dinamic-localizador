/**
 * Lookup multi-search helpers for collaborator autocomplete.
 *
 * Commas separate independent person searches; spaces within a group refine
 * the same person (AND), matching backend employee lookup semantics.
 *
 * Group consumption uses the association stamped on the option when the lookup
 * returned (`sourceSearch` + `groupIndex` / `groupKey`), never label scoring.
 */

export function splitLookupSearchTerms(group: string): string[] {
  return group
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

/** Parse comma-separated independent search groups (empty groups dropped). */
export function parseLookupSearchGroups(search: string): string[][] {
  return search
    .split(",")
    .map((group) => splitLookupSearchTerms(group))
    .filter((terms) => terms.length > 0);
}

export function formatLookupSearchGroups(groups: ReadonlyArray<ReadonlyArray<string>>): string {
  return groups
    .map((terms) => terms.join(" "))
    .filter((group) => group.length > 0)
    .join(", ");
}

export function lookupSearchGroupKey(terms: ReadonlyArray<string>): string {
  return terms.join(" ");
}

/** Canonical multi-search form used to compare snapshots across formatting noise. */
export function canonicalizeLookupSearch(search: string): string {
  return formatLookupSearchGroups(parseLookupSearchGroups(search));
}

export type LookupSearchGroupAssociation = {
  /** Index within `sourceSearch` from the backend/page that produced the option. */
  groupIndex?: number;
  /** Stable group text (`terms.join(" ")`) from that same snapshot. */
  groupKey?: string;
  /** Exact search string (or equivalent) that generated the option. */
  sourceSearch?: string;
};

function isValidGroupIndex(index: number | undefined, groupCount: number): index is number {
  return (
    index !== undefined &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < groupCount
  );
}

/**
 * Drop the search group associated with a selected lookup option.
 *
 * - Same search snapshot → consume by `groupIndex` (deterministic, supports duplicate keys).
 * - Stale options (search already advanced) → consume by unique `groupKey` in the current input.
 * - Missing / ambiguous / out-of-range association → preserve pending searches.
 */
export function consumeLookupSearchGroupForSelection(
  search: string,
  association?: LookupSearchGroupAssociation | null,
): string {
  const groups = parseLookupSearchGroups(search);
  if (groups.length === 0) {
    return "";
  }

  const formatted = formatLookupSearchGroups(groups);
  if (!association) {
    return formatted;
  }

  const sameSnapshot =
    association.sourceSearch !== undefined &&
    canonicalizeLookupSearch(association.sourceSearch) === formatted;

  if (sameSnapshot && isValidGroupIndex(association.groupIndex, groups.length)) {
    return formatLookupSearchGroups(
      groups.filter((_, index) => index !== association.groupIndex),
    );
  }

  if (association.groupKey) {
    const matches = groups
      .map((terms, index) => ({ index, key: lookupSearchGroupKey(terms) }))
      .filter((entry) => entry.key === association.groupKey);
    if (matches.length === 1) {
      return formatLookupSearchGroups(
        groups.filter((_, index) => index !== matches[0]!.index),
      );
    }
  }

  return formatted;
}
