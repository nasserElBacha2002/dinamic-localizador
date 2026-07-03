import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { SortOrder, TableUrlFieldMap } from "../utils/table-url-state";
import {
  mergeTableUrlPatch,
  parseTableUrlState,
  serializeTableUrlState,
} from "../utils/table-url-state";
import { useDebouncedValue } from "./useDebouncedValue";

export interface UseTableUrlStateOptions<T extends Record<string, unknown>> {
  defaults: T;
  fields?: TableUrlFieldMap<T>;
  shouldOmitFromUrl?: (key: keyof T, value: T[keyof T], defaults: T, state: T) => boolean;
  debounceSearch?: boolean;
  searchDebounceMs?: number;
}

export interface UseTableUrlStateResult<T extends Record<string, unknown>> {
  state: T;
  setState: (patch: Partial<T>, options?: { resetPage?: boolean }) => void;
  setField: <K extends keyof T>(key: K, value: T[K], options?: { resetPage?: boolean }) => void;
  setSearch: (value: string) => void;
  commitSearch: (value?: string) => void;
  searchInput: string;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  resetPage: () => void;
  setSorting: (sortBy: string, sortOrder: SortOrder) => void;
  toggleSorting: (sortBy: string, defaultOrder?: SortOrder) => void;
  resetFilters: () => void;
  clearState: () => void;
  page: number;
  pageSize: number;
  sortBy: string | undefined;
  sortOrder: SortOrder | undefined;
}

function hasSearchKey<T extends Record<string, unknown>>(defaults: T): defaults is T & { search: string } {
  return "search" in defaults;
}

export function useTableUrlState<T extends Record<string, unknown>>(
  options: UseTableUrlStateOptions<T>,
): UseTableUrlStateResult<T> {
  const {
    defaults,
    fields,
    shouldOmitFromUrl,
    debounceSearch = hasSearchKey(defaults),
    searchDebounceMs = 300,
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo(
    () =>
      parseTableUrlState({
        defaults,
        fields,
        searchParams,
      }),
    [defaults, fields, searchParams],
  );

  const [searchInput, setSearchInput] = useState(() => {
    const initial = hasSearchKey(defaults) ? String(state.search ?? "") : "";
    return initial;
  });
  const skipSearchDebounceRef = useRef(false);
  const searchInputRef = useRef(
    hasSearchKey(defaults) ? String(state.search ?? "") : "",
  );

  const updateSearchInput = useCallback((value: string) => {
    searchInputRef.current = value;
    setSearchInput(value);
  }, []);

  useEffect(() => {
    if (!hasSearchKey(defaults)) {
      return;
    }

    const urlSearch = String(state.search ?? "");
    if (searchInputRef.current !== urlSearch) {
      updateSearchInput(urlSearch);
    }
  }, [defaults, state.search, updateSearchInput]);

  const debouncedSearchInput = useDebouncedValue(searchInput, searchDebounceMs);

  const writeState = useCallback(
    (nextState: T) => {
      const params = serializeTableUrlState({
        state: nextState,
        defaults,
        fields,
        shouldOmitFromUrl,
      });
      setSearchParams(params, { replace: true });
    },
    [defaults, fields, setSearchParams, shouldOmitFromUrl],
  );

  const setState = useCallback(
    (patch: Partial<T>, patchOptions?: { resetPage?: boolean }) => {
      let next = mergeTableUrlPatch(state, patch, defaults, fields);

      if (patchOptions?.resetPage === false) {
        next = { ...state, ...patch };
      } else if (patchOptions?.resetPage === true && "page" in defaults) {
        next = { ...next, page: 1 as T[keyof T] };
      }

      writeState(next);
    },
    [defaults, fields, state, writeState],
  );

  const setField = useCallback(
    <K extends keyof T>(key: K, value: T[K], patchOptions?: { resetPage?: boolean }) => {
      setState({ [key]: value } as unknown as Partial<T>, patchOptions);
    },
    [setState],
  );

  useEffect(() => {
    if (!debounceSearch || !hasSearchKey(defaults)) {
      return;
    }

    const nextSearch = debouncedSearchInput.trim();
    const currentSearch = String(state.search ?? "").trim();

    if (skipSearchDebounceRef.current) {
      skipSearchDebounceRef.current = false;
      return;
    }

    if (nextSearch === currentSearch) {
      return;
    }

    setState({ search: nextSearch } as unknown as Partial<T>, { resetPage: true });
  }, [debounceSearch, debouncedSearchInput, defaults, setState, state.search]);

  const commitSearch = useCallback(
    (value?: string) => {
      if (!hasSearchKey(defaults)) {
        return;
      }

      const nextValue = value ?? searchInputRef.current;
      const nextSearch = nextValue.trim();
      updateSearchInput(nextValue);
      skipSearchDebounceRef.current = true;
      setState({ search: nextSearch } as unknown as Partial<T>, { resetPage: true });
    },
    [defaults, setState, updateSearchInput],
  );

  const setSearch = useCallback(
    (value: string) => {
      if (!hasSearchKey(defaults)) {
        return;
      }

      updateSearchInput(value);

      if (!value.trim()) {
        setState({ search: "" } as unknown as Partial<T>, { resetPage: true });
      }
    },
    [defaults, setState, updateSearchInput],
  );

  const setPage = useCallback(
    (page: number) => {
      if (!("page" in defaults)) {
        return;
      }

      setState({ page } as unknown as Partial<T>, { resetPage: false });
    },
    [defaults, setState],
  );

  const setPageSize = useCallback(
    (pageSize: number) => {
      if (!("pageSize" in defaults)) {
        return;
      }

      setState({ pageSize, page: 1 } as unknown as Partial<T>, { resetPage: false });
    },
    [defaults, setState],
  );

  const setSorting = useCallback(
    (sortBy: string, sortOrder: SortOrder) => {
      const patch = {} as Record<string, unknown>;
      if ("sortBy" in defaults) {
        patch.sortBy = sortBy;
      }
      if ("sortOrder" in defaults) {
        patch.sortOrder = sortOrder;
      }
      setState(patch as Partial<T>);
    },
    [defaults, setState],
  );

  const toggleSorting = useCallback(
    (sortBy: string, defaultOrder: SortOrder = "asc") => {
      if (!("sortBy" in defaults) || !("sortOrder" in defaults)) {
        return;
      }

      const currentSortBy = String(state.sortBy ?? defaults.sortBy);
      const currentSortOrder = (state.sortOrder ?? defaults.sortOrder) as SortOrder;

      if (currentSortBy === sortBy) {
        setSorting(sortBy, currentSortOrder === "asc" ? "desc" : "asc");
        return;
      }

      setSorting(sortBy, defaultOrder);
    },
    [defaults, setSorting, state.sortBy, state.sortOrder],
  );

  const resetFilters = useCallback(() => {
    writeState({ ...defaults });
    if (hasSearchKey(defaults)) {
      updateSearchInput(String(defaults.search ?? ""));
    }
  }, [defaults, updateSearchInput, writeState]);

  const clearState = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
    if (hasSearchKey(defaults)) {
      updateSearchInput("");
    }
  }, [defaults, setSearchParams, updateSearchInput]);

  const page = "page" in state ? Number(state.page) : 1;
  const pageSize = "pageSize" in state ? Number(state.pageSize) : 10;
  const sortBy = "sortBy" in state ? String(state.sortBy) : undefined;
  const sortOrder = "sortOrder" in state ? (state.sortOrder as SortOrder) : undefined;

  return {
    state,
    setState,
    setField,
    setSearch,
    commitSearch,
    searchInput,
    setPage,
    setPageSize,
    onPageChange: setPage,
    onPageSizeChange: setPageSize,
    resetPage: () => setPage(1),
    setSorting,
    toggleSorting,
    resetFilters,
    clearState,
    page,
    pageSize,
    sortBy,
    sortOrder,
  };
}
