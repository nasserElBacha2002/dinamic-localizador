import { Table, TableBody, TableContainer } from "@mui/material";
import type { ReactNode } from "react";
import type { PaginationMeta } from "../../types/api";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { PaginationControls } from "./PaginationControls";

interface DataTableProps {
  children: ReactNode;
  head: ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  meta?: PaginationMeta;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  showPageSizeSelector?: boolean;
}

export function DataTable({
  children,
  head,
  isLoading = false,
  isError = false,
  errorMessage,
  isEmpty = false,
  emptyTitle = "No hay registros",
  emptyDescription,
  meta,
  pageSize,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = false,
}: DataTableProps) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return <ErrorState message={errorMessage ?? "No se pudieron cargar los datos."} />;
  }

  if (isEmpty) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <TableContainer>
        <Table size="small">
          {head}
          <TableBody>{children}</TableBody>
        </Table>
      </TableContainer>

      {meta && onPageChange ? (
        <PaginationControls
          meta={meta}
          onPageChange={onPageChange}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          showPageSizeSelector={showPageSizeSelector}
        />
      ) : null}
    </>
  );
}
