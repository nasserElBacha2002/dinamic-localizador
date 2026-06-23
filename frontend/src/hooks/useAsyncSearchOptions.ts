import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { SearchAutocompleteOption } from "../types/search-autocomplete";
import { useDebouncedValue } from "./useDebouncedValue";

interface UseAsyncSearchOptionsParams<T> {
  queryKey: string;
  fetchItems: (search: string) => Promise<T[]>;
  mapToOption: (item: T) => SearchAutocompleteOption;
  debounceMs?: number;
  minSearchLength?: number;
  enabled?: boolean;
  queryExtra?: unknown;
}

export function useAsyncSearchOptions<T>({
  queryKey,
  fetchItems,
  mapToOption,
  debounceMs = 300,
  minSearchLength = 0,
  enabled = true,
  queryExtra,
}: UseAsyncSearchOptionsParams<T>) {
  const [inputValue, setInputValue] = useState("");
  const debouncedSearch = useDebouncedValue(inputValue, debounceMs);
  const canSearch = debouncedSearch.trim().length >= minSearchLength;

  const { data, isFetching, isFetched } = useQuery({
    queryKey: [queryKey, debouncedSearch, queryExtra],
    queryFn: () => fetchItems(debouncedSearch.trim()),
    enabled: enabled && canSearch,
    placeholderData: keepPreviousData,
  });

  const options = useMemo(
    () => (data ?? []).map(mapToOption),
    [data, mapToOption],
  );

  return {
    inputValue,
    setInputValue,
    options,
    isLoading: isFetching,
    hasSearched: isFetched && canSearch,
    debouncedSearch: debouncedSearch.trim(),
  };
}
