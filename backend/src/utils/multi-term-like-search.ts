/**
 * Split whitespace-separated tokens within one person/search group.
 * Collapses repeated whitespace and drops empty tokens.
 */
export function splitSearchTerms(search: string): string[] {
  return search
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

/**
 * Parse a lookup search string into independent search groups.
 *
 * - Commas separate independent searches (union / OR).
 * - Spaces within a group refine the same person (AND).
 * - Repeated spaces, spaces around commas, consecutive commas, and empty
 *   groups/terms are ignored.
 */
export function parseLookupSearchGroups(search: string): string[][] {
  return search
    .split(",")
    .map((group) => splitSearchTerms(group))
    .filter((terms) => terms.length > 0);
}

export type LikeSearchParam = {
  name: string;
  /** Value already wrapped with SQL LIKE wildcards (e.g. `%ana%`). */
  value: string;
};

export type MultiTermLikeClause = {
  clause: string | null;
  params: LikeSearchParam[];
};

/**
 * Build a parameterized AND of LIKE predicates for one person/search group.
 * A single term keeps the historical `@paramPrefix` shape.
 */
export function buildGroupAndLikeClause(
  columnExpression: string,
  terms: string[],
  paramPrefix: string,
): MultiTermLikeClause {
  if (terms.length === 0) {
    return { clause: null, params: [] };
  }

  if (terms.length === 1) {
    return {
      clause: `${columnExpression} LIKE @${paramPrefix}`,
      params: [{ name: paramPrefix, value: `%${terms[0]}%` }],
    };
  }

  const params = terms.map((term, index) => ({
    name: `${paramPrefix}${index}`,
    value: `%${term}%`,
  }));

  return {
    clause: `(${params.map((param) => `${columnExpression} LIKE @${param.name}`).join(" AND ")})`,
    params,
  };
}

/**
 * Build a parameterized LIKE predicate for employee lookup search.
 *
 * Semantics:
 * - Single term → same historical shape (`column LIKE @search`).
 * - Spaces within a group → AND of LIKE predicates (same person).
 * - Comma-separated groups → OR between groups (union of people).
 *
 * Prefer per-group queries + {@link mergeEmployeeLookupGroups} when applying
 * `TOP (@limit)` so one group cannot monopolize the result set.
 */
export function buildMultiTermLikeSearchClause(
  columnExpression: string,
  search: string,
  paramPrefix = "search",
): MultiTermLikeClause {
  const groups = parseLookupSearchGroups(search);
  if (groups.length === 0) {
    return { clause: null, params: [] };
  }

  if (groups.length === 1) {
    return buildGroupAndLikeClause(columnExpression, groups[0]!, paramPrefix);
  }

  const params: LikeSearchParam[] = [];
  let paramIndex = 0;

  const groupClauses = groups.map((terms) => {
    const termClauses = terms.map((term) => {
      const name = `${paramPrefix}${paramIndex}`;
      paramIndex += 1;
      params.push({ name, value: `%${term}%` });
      return `${columnExpression} LIKE @${name}`;
    });

    return termClauses.length === 1
      ? termClauses[0]!
      : `(${termClauses.join(" AND ")})`;
  });

  return {
    clause: `(${groupClauses.join(" OR ")})`,
    params,
  };
}

export type EmployeeLookupNameRow = {
  id: string;
  fullName: string;
};

export type EmployeeLookupMergedRow = EmployeeLookupNameRow & {
  /** Group index from the per-group page that first contributed this id. */
  matchedGroupIndex: number;
};

/**
 * Merge per-group lookup pages (each already limited with TOP) into one
 * deduplicated, name-sorted list. First occurrence of an id wins and keeps
 * that group's index as the deterministic origin for UI consumption.
 */
export function mergeEmployeeLookupGroups(
  groups: ReadonlyArray<ReadonlyArray<EmployeeLookupNameRow>>,
): EmployeeLookupMergedRow[] {
  const byId = new Map<string, EmployeeLookupMergedRow>();

  groups.forEach((group, groupIndex) => {
    for (const row of group) {
      if (!byId.has(row.id)) {
        byId.set(row.id, { ...row, matchedGroupIndex: groupIndex });
      }
    }
  });

  return [...byId.values()].sort((left, right) =>
    left.fullName.localeCompare(right.fullName),
  );
}
