export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** Maps backend `PaginationMeta` (`limit`, `total`) to design-system shape. */
export function mapApiPaginationMeta(meta: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}): PaginationMeta {
  return {
    page: meta.page,
    pageSize: meta.limit,
    totalItems: meta.total,
    totalPages: meta.totalPages,
  };
}
