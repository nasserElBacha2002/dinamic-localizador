import {
  Group,
  Paper,
  ScrollArea,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import type { KeyboardEvent, ReactNode } from "react";
import { useIsBelow } from "../hooks/useIsBelow";
import { DataTableCards } from "./data-table-cards";
import { resolveDataTableCellValue } from "./data-table-cell";
import type {
  DataTableProps,
  SortDirection,
} from "./data-table-types";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

export type {
  DataTableColumn,
  DataTableMobileCardConfig,
  DataTableMobileField,
  DataTableMobileView,
  DataTableProps,
  SortDirection,
} from "./data-table-types";

function handleRowKeyDown<T>(
  event: KeyboardEvent<HTMLElement>,
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

export function DataTable<T>(props: DataTableProps<T>) {
  const {
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
    scrollMinWidth,
  } = props;

  const mobileView = props.mobileView ?? "scroll";
  const mobileCard = "mobileCard" in props ? props.mobileCard : undefined;

  const isMobile = useIsBelow("sm");
  const safeRows = Array.isArray(rows) ? rows : [];
  const useMobileCards =
    isMobile &&
    (mobileView === "cards" || mobileView === "summary") &&
    Boolean(mobileCard);

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

  if (useMobileCards && mobileCard) {
    return (
      <>
        <DataTableCards
          rows={safeRows}
          getRowKey={getRowKey}
          onRowClick={onRowClick}
          isRowClickable={isRowClickable}
          rowActions={rowActions}
          mobileCard={mobileCard}
          summary={mobileView === "summary"}
          aria-label={ariaLabel}
        />
        {pagination}
      </>
    );
  }

  return (
    <>
      <Paper withBorder radius="md">
        <ScrollArea type="auto" offsetScrollbars>
          <Table
            striped
            highlightOnHover
            verticalSpacing="sm"
            horizontalSpacing="md"
            fz="sm"
            aria-label={ariaLabel}
            style={scrollMinWidth !== undefined ? { minWidth: scrollMinWidth } : undefined}
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
                const clickable =
                  Boolean(onRowClick) && (isRowClickable ? isRowClickable(row) : true);

                return (
                  <Table.Tr
                    key={rowKey}
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? "button" : undefined}
                    onClick={clickable ? () => onRowClick?.(row) : undefined}
                    onKeyDown={
                      clickable
                        ? (event) => handleRowKeyDown(event, row, onRowClick)
                        : undefined
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
