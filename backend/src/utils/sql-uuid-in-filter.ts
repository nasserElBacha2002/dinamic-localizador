import sql from "mssql";
import type { SqlFilter } from "./sql-list-query";

/**
 * Build a parameterized UUID equality / IN filter.
 * Returns undefined when `values` is empty (caller should omit the filter).
 */
export function createUuidInFilter(options: {
  column: string;
  parameterPrefix: string;
  /** Empty or missing → no filter (safe for callers that skip Zod transforms). */
  values: string[] | undefined;
}): SqlFilter | undefined {
  const values = options.values ?? [];
  if (values.length === 0) {
    return undefined;
  }

  const { column, parameterPrefix } = options;

  if (values.length === 1) {
    return {
      clause: `${column} = @${parameterPrefix}`,
      apply: (request) => request.input(parameterPrefix, sql.UniqueIdentifier, values[0]),
    };
  }

  const placeholders = values.map((_, index) => `@${parameterPrefix}${index}`);
  return {
    clause: `${column} IN (${placeholders.join(", ")})`,
    apply: (request) => {
      values.forEach((id, index) => {
        request.input(`${parameterPrefix}${index}`, sql.UniqueIdentifier, id);
      });
    },
  };
}
