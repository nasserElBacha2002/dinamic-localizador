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
 * Build a parameterized LIKE predicate for employee lookup search.
 *
 * Semantics:
 * - Single term → same historical shape (`column LIKE @search`).
 * - Spaces within a group → AND of LIKE predicates (same person).
 * - Comma-separated groups → OR between groups (union of people).
 *
 * SQL returns each matching row once even if it satisfies multiple groups.
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

  if (groups.length === 1 && groups[0].length === 1) {
    return {
      clause: `${columnExpression} LIKE @${paramPrefix}`,
      params: [{ name: paramPrefix, value: `%${groups[0][0]}%` }],
    };
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

  const clause =
    groupClauses.length === 1
      ? groupClauses[0]!
      : `(${groupClauses.join(" OR ")})`;

  return { clause, params };
}
