import { Group, Paper, ScrollArea, Table, Text, UnstyledButton } from "@mantine/core";
import type { KeyboardEvent, ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { resolveDataTableCellValue } from "./data-table-cell";

export type SortDirection = "asc" | "desc";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  width?: number | string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
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
  isRowClickable?: (row: T) => boolean;
  rowActions?: (row: T) => ReactNode;
  rowActionsHeader?: ReactNode;
  pagination?: ReactNode;
  sortBy?: string;
  sortDirection?: SortDirection;
  onSortChange?: (columnKey: string) => void;
  "aria-label"?: string;
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

interface SortableHeaderProps {
  label: ReactNode;
  columnKey: string;
  sortable?: boolean;
  sortBy?: string;
  sortDirection?: SortDirection;
  onSortChange?: (columnKey: string) => void;
}

function SortableHeader({
  label,
  columnKey,
  sortable,
  sortBy,
  sortDirection,
  onSortChange,
}: SortableHeaderProps) {
  if (!sortable || !onSortChange) {
    return <>{label}</>;
  }

  const isActive = sortBy === columnKey;
  const indicator = isActive ? (sortDirection === "asc" ? "↑" : "↓") : "↕";

  return (
    <UnstyledButton
      onClick={() => onSortChange(columnKey)}
      aria-label={`Ordenar por ${typeof label === "string" ? label : columnKey}`}
      style={{ width: "100%" }}
    >
      <Group gap={4} wrap="nowrap" justify="flex-start">
        <Text span size="sm" fw={isActive ? 600 : 500}>
          {label}
        </Text>
        <Text span size="xs" c={isActive ? "brand" : "dimmed"} aria-hidden>
          {indicator}
        </Text>
      </Group>
    </UnstyledButton>
  );
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
  isRowClickable,
  rowActions,
  rowActionsHeader = "Acciones",
  pagination,
  sortBy,
  sortDirection,
  onSortChange,
  "aria-label": ariaLabel,
}: DataTableProps<T>) {
  const safeRows = Array.isArray(rows) ? rows : [];

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

  if (safeRows.length === 0) {
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
                {columns.map((column) => {
                  const isSortable = Boolean(column.sortable && onSortChange);
                  const isActive = sortBy === column.key;
                  const ariaSort = !isSortable
                    ? undefined
                    : !isActive
                      ? "none"
                      : sortDirection === "asc"
                        ? "ascending"
                        : "descending";

                  return (
                    <Table.Th
                      key={column.key}
                      aria-sort={ariaSort}
                      style={{
                        width: column.width,
                        textAlign: column.align ?? "left",
                      }}
                    >
                      <SortableHeader
                        label={column.header}
                        columnKey={column.key}
                        sortable={column.sortable}
                        sortBy={sortBy}
                        sortDirection={sortDirection}
                        onSortChange={onSortChange}
                      />
                    </Table.Th>
                  );
                })}
                {rowActions ? (
                  <Table.Th style={{ textAlign: "right" }}>{rowActionsHeader}</Table.Th>
                ) : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {safeRows.map((row) => {
                const rowKey = getRowKey(row);
                const clickable = Boolean(onRowClick) && (isRowClickable ? isRowClickable(row) : true);

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
                    data-clickable={clickable ? "true" : undefined}
                  >
                    {columns.map((column) => (
                      <Table.Td key={column.key} style={{ textAlign: column.align ?? "left" }}>
                        {resolveDataTableCellValue(row, column)}
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
