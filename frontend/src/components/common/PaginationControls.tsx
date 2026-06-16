import { Pagination, Stack, Typography } from "@mui/material";
import type { PaginationMeta } from "../../types/api";

interface PaginationControlsProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}

export function PaginationControls({ meta, onPageChange }: PaginationControlsProps) {
  if (meta.totalPages <= 1) {
    return null;
  }

  return (
    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems="center" sx={{ mt: 3 }}>
      <Typography variant="body2" color="text.secondary">
        Página {meta.page} de {meta.totalPages} · {meta.total} registros
      </Typography>
      <Pagination
        page={meta.page}
        count={meta.totalPages}
        onChange={(_event, page) => onPageChange(page)}
        color="primary"
        showFirstButton
        showLastButton
      />
    </Stack>
  );
}
