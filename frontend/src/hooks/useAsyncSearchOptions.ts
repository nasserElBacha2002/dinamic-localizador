import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { SearchAutocompleteOption } from "../types/search-autocomplete";
import { useDebouncedValue } from "./useDebouncedValue";

interface UseAsyncSearchOptionsParams<T> {
  /** Stable key factory including company + normalized search params. */
  getQueryKey: (debouncedSearch: string) => readonly unknown[];
  fetchItems: (search: string, signal: AbortSignal) => Promise<T[]>;
  mapToOption: (item: T) => SearchAutocompleteOption;
  debounceMs?: number;
  minSearchLength?: number;
  enabled?: boolean;
  staleTime?: number;
}

export function useAsyncSearchOptions<T>({
  getQueryKey,
  fetchItems,
  mapToOption,
  debounceMs = 300,
  minSearchLength = 0,
  enabled = true,
  staleTime,
}: UseAsyncSearchOptionsParams<T>) {
  const [inputValue, setInputValue] = useState("");
  const debouncedSearch = useDebouncedValue(inputValue, debounceMs);
  const canSearch = debouncedSearch.trim().length >= minSearchLength;
  const trimmedSearch = debouncedSearch.trim();

  const { data, isFetching, isFetched } = useQuery({
    queryKey: getQueryKey(trimmedSearch),
    queryFn: ({ signal }) => fetchItems(trimmedSearch, signal),
    enabled: enabled && canSearch,
    placeholderData: keepPreviousData,
    staleTime,
  });

  const options = useMemo(
    () => (data ?? []).map(mapToOption),
    [data, mapToOption],
  );

  return {
    inputValue,
    setInputValue,
    options,
    items: data ?? [],
    isLoading: isFetching,
    hasSearched: isFetched && canSearch,
    debouncedSearch: trimmedSearch,
  };
}
