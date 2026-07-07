import type sql from "mssql";

export interface SqlFilter {
  clause: string;
  apply: (request: sql.Request) => void;
}

export const buildWhereClause = (filters: SqlFilter[]): string => {
  if (filters.length === 0) {
    return "";
  }

  return `WHERE ${filters.map((filter) => filter.clause).join(" AND ")}`;
};

export const buildAndClause = (filters: SqlFilter[]): string => {
  if (filters.length === 0) {
    return "";
  }

  return `AND ${filters.map((filter) => filter.clause).join(" AND ")}`;
};

export const applySqlFilters = (request: sql.Request, filters: SqlFilter[]): void => {
  for (const filter of filters) {
    filter.apply(request);
  }
};
