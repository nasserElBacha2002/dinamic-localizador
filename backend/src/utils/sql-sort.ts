export const resolveSqlSort = (
  sortBy: string | undefined,
  whitelist: Record<string, string>,
  defaultField: string,
  sortDirection: "asc" | "desc",
): string => {
  const column = sortBy && whitelist[sortBy] ? whitelist[sortBy] : defaultField;
  const direction = sortDirection === "asc" ? "ASC" : "DESC";
  return `${column} ${direction}`;
};
