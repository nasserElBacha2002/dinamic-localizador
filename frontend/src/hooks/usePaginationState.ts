import { useCallback, useState } from "react";

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export interface PaginationState {
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  resetPage: () => void;
}

export function usePaginationState(initialPageSize = 10): PaginationState {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const onPageChange = useCallback((nextPage: number) => {
    setPage(nextPage);
  }, []);

  const onPageSizeChange = useCallback((nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  }, []);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  return {
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    resetPage,
  };
}
