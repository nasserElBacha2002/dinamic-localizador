import { Group, Pagination, Select, Stack, Text } from "@mantine/core";
import type { PaginationMeta } from "./pagination-meta";

export interface PaginationControlsProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  showPageSizeSelector?: boolean;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50];

function formatRange(meta: PaginationMeta): string {
  if (meta.totalItems === 0) {
    return "Mostrando 0 de 0";
  }

  const start = (meta.page - 1) * meta.pageSize + 1;
  const end = Math.min(meta.page * meta.pageSize, meta.totalItems);
  return `Mostrando ${start}–${end} de ${meta.totalItems}`;
}

export function PaginationControls({
  meta,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  showPageSizeSelector = false,
}: PaginationControlsProps) {
  if (meta.totalItems === 0) {
    return null;
  }

  const totalPages = Math.max(meta.totalPages, 1);
  const currentPage = Math.min(Math.max(meta.page, 1), totalPages);
  const showPagination = totalPages > 1;

  return (
    <Stack gap="sm" mt="md">
      <Text size="sm" c="dimmed">
        {formatRange(meta)}
        {showPagination ? ` · Página ${currentPage} de ${totalPages}` : null}
      </Text>

      <Group justify="space-between" align="center" wrap="wrap" gap="md">
        {showPageSizeSelector && onPageSizeChange && pageSize ? (
          <Select
            size="xs"
            label="Por página"
            aria-label="Registros por página"
            value={String(pageSize)}
            onChange={(value) => {
              if (value) {
                onPageSizeChange(Number(value));
              }
            }}
            data={pageSizeOptions.map((option) => ({
              value: String(option),
              label: String(option),
            }))}
            w={120}
          />
        ) : (
          <div />
        )}

        {showPagination ? (
          <Pagination
            value={currentPage}
            total={totalPages}
            onChange={onPageChange}
            withEdges
          />
        ) : null}
      </Group>
    </Stack>
  );
}
