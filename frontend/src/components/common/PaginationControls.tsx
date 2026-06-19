import {
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Select,
  Stack,
  Typography,
} from "@mui/material";
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
    <Stack
      direction={{ xs: "column", sm: "row" }}
      justifyContent="space-between"
      alignItems={{ xs: "stretch", sm: "center" }}
      spacing={2}
      sx={{ mt: 3 }}
    >
      <Typography variant="body2" color="text.secondary">
        Página {meta.page} de {Math.max(meta.totalPages, 1)} · {meta.total} registros
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end">
        {showPageSizeSelector && onPageSizeChange && pageSize ? (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="page-size-label">Por página</InputLabel>
            <Select
              labelId="page-size-label"
              label="Por página"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {pageSizeOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}

        {showPagination ? (
          <Pagination
            page={meta.page}
            count={meta.totalPages}
            onChange={(_event, page) => onPageChange(page)}
            color="primary"
            showFirstButton
            showLastButton
          />
        ) : null}
      </Stack>
    </Stack>
  );
}
