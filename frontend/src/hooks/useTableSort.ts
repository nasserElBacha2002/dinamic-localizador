import { useCallback, useState } from "react";

export function useTableSort<T extends string>(
  defaultField: T,
  defaultDirection: "asc" | "desc" = "asc",
) {
  const [sortBy, setSortBy] = useState<T>(defaultField);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(defaultDirection);

  const onSortChange = useCallback(
    (field: T) => {
      if (sortBy === field) {
        setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }

      setSortBy(field);
      setSortDirection("asc");
    },
    [sortBy],
  );

  const resetSort = useCallback(() => {
    setSortBy(defaultField);
    setSortDirection(defaultDirection);
  }, [defaultDirection, defaultField]);

  return { sortBy, sortDirection, onSortChange, resetSort };
}
