import { Group, Pagination, Select, Stack, Text } from "@mantine/core";
import type { PaginationMeta } from "../../types/api";
import { DEFAULT_PAGE_SIZE_OPTIONS } from "../../hooks/usePaginationState";

interface PaginationControlsProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (pageSize: number) => void;
  showPageSizeSelector?: boolean;
}

export function PaginationControls({
  meta,
  onPageChange,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageSizeChange,
  showPageSizeSelector = false,
}: PaginationControlsProps) {
  if (meta.total === 0) {
    return null;
  }

  const showPagination = meta.totalPages > 1;

  return (
    <Stack gap="md" mt="lg">
      <Text size="sm" c="dimmed">
        Página {meta.page} de {Math.max(meta.totalPages, 1)} · {meta.total} registros
      </Text>

      <Group justify="flex-end" gap="md" wrap="wrap">
        {showPageSizeSelector && onPageSizeChange && pageSize ? (
          <Select
            label="Por página"
            data={pageSizeOptions.map((option) => ({ value: String(option), label: String(option) }))}
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
            w={120}
          />
        ) : null}

        {showPagination ? (
          <Pagination
            total={meta.totalPages}
            value={meta.page}
            onChange={onPageChange}
            withEdges
          />
        ) : null}
      </Group>
    </Stack>
  );
}
