import { Paper, ScrollArea, Table } from "@mantine/core";
import type { KeyboardEvent, ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  width?: number | string;
  align?: "left" | "center" | "right";
  render?: (row: T) => ReactNode;
  getValue?: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string | number;
  loading?: boolean;
  error?: ReactNode;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  pagination?: ReactNode;
  "aria-label"?: string;
}

function getCellValue<T>(row: T, column: DataTableColumn<T>): ReactNode {
  if (column.render) {
    return column.render(row);
  }

  if (column.getValue) {
    return column.getValue(row);
  }

  return null;
}

function handleRowKeyDown<T>(
  event: KeyboardEvent<HTMLTableRowElement>,
  row: T,
  onRowClick?: (row: T) => void,
) {
  if (!onRowClick) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onRowClick(row);
  }
}

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  loading = false,
  error,
  emptyTitle = "Sin resultados",
  emptyDescription = "No hay datos para mostrar.",
  onRowClick,
  rowActions,
  pagination,
  "aria-label": ariaLabel,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <Paper withBorder radius="md" p="md">
        <LoadingState message="Cargando datos..." />
      </Paper>
    );
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <Paper withBorder radius="md">
        <ScrollArea type="auto">
          <Table
            striped
            highlightOnHover
            verticalSpacing="sm"
            horizontalSpacing="md"
            fz="sm"
            aria-label={ariaLabel}
          >
            <Table.Thead>
              <Table.Tr>
                {columns.map((column) => (
                  <Table.Th
                    key={column.key}
                    style={{
                      width: column.width,
                      textAlign: column.align ?? "left",
                    }}
                  >
                    {column.header}
                  </Table.Th>
                ))}
                {rowActions ? <Table.Th style={{ textAlign: "right" }} /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => {
                const rowKey = getRowKey(row);
                const clickable = Boolean(onRowClick);

                return (
                  <Table.Tr
                    key={rowKey}
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? "button" : undefined}
                    onClick={clickable ? () => onRowClick?.(row) : undefined}
                    onKeyDown={
                      clickable ? (event) => handleRowKeyDown(event, row, onRowClick) : undefined
                    }
                    style={clickable ? { cursor: "pointer" } : undefined}
                  >
                    {columns.map((column) => (
                      <Table.Td key={column.key} style={{ textAlign: column.align ?? "left" }}>
                        {getCellValue(row, column)}
                      </Table.Td>
                    ))}
                    {rowActions ? (
                      <Table.Td
                        align="right"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {rowActions(row)}
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>
      {pagination}
    </>
  );
}
