import {
  Accordion,
  Box,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import type { KeyboardEvent, ReactNode } from "react";
import { useIsBelow } from "../hooks/useIsBelow";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { resolveDataTableCellValue } from "./data-table-cell";

export type SortDirection = "asc" | "desc";
export type DataTableMobileView = "scroll" | "cards" | "summary";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  width?: number | string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  getValue?: (row: T) => ReactNode;
}

export interface DataTableMobileField<T> {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  priority?: "primary" | "secondary";
}

export interface DataTableMobileCardConfig<T> {
  title: (row: T) => ReactNode;
  subtitle?: (row: T) => ReactNode;
  status?: (row: T) => ReactNode;
  fields?: Array<DataTableMobileField<T>>;
  actions?: (row: T) => ReactNode;
  /** Used by `summary` mode for expandable content. */
  expandedContent?: (row: T) => ReactNode;
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
  /**
   * Mobile presentation below `sm`.
   * Default `scroll` preserves legacy horizontal-scroll tables.
   */
  mobileView?: DataTableMobileView;
  mobileCard?: DataTableMobileCardConfig<T>;
  /** Min width for scroll-mode table only. */
  scrollMinWidth?: number | string;
}

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

function DataTableCards<T>({
  rows,
  getRowKey,
  onRowClick,
  isRowClickable,
  rowActions,
  mobileCard,
  summary,
  "aria-label": ariaLabel,
}: {
  rows: T[];
  getRowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  isRowClickable?: (row: T) => boolean;
  rowActions?: (row: T) => ReactNode;
  mobileCard: DataTableMobileCardConfig<T>;
  summary: boolean;
  "aria-label"?: string;
}) {
  const primaryFields =
    mobileCard.fields?.filter((field) => field.priority !== "secondary") ??
    mobileCard.fields ??
    [];
  const secondaryFields =
    mobileCard.fields?.filter((field) => field.priority === "secondary") ?? [];

  if (summary) {
    return (
      <Accordion variant="separated" radius="md" aria-label={ariaLabel}>
        {rows.map((row) => {
          const rowKey = String(getRowKey(row));
          const clickable = Boolean(onRowClick) && (isRowClickable ? isRowClickable(row) : true);
          const actions = mobileCard.actions?.(row) ?? rowActions?.(row);

          return (
            <Accordion.Item key={rowKey} value={rowKey}>
              <Accordion.Control>
                <Group justify="space-between" wrap="nowrap" gap="sm" pr="xs">
                  <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                    <Text fw={600} size="sm" lineClamp={2}>
                      {mobileCard.title(row)}
                    </Text>
                    {mobileCard.subtitle ? (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {mobileCard.subtitle(row)}
                      </Text>
                    ) : null}
                  </Stack>
                  {mobileCard.status?.(row)}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  {primaryFields.map((field) => (
                    <Box key={field.key}>
                      <Text size="xs" c="dimmed">
                        {field.label}
                      </Text>
                      <Text size="sm">{field.render(row)}</Text>
                    </Box>
                  ))}
                  {secondaryFields.map((field) => (
                    <Box key={field.key}>
                      <Text size="xs" c="dimmed">
                        {field.label}
                      </Text>
                      <Text size="sm">{field.render(row)}</Text>
                    </Box>
                  ))}
                  {mobileCard.expandedContent?.(row)}
                  <Group justify="space-between" gap="sm" wrap="wrap">
                    {clickable ? (
                      <UnstyledButton
                        onClick={() => onRowClick?.(row)}
                        style={{ fontSize: "var(--mantine-font-size-sm)", fontWeight: 600 }}
                      >
                        Ver detalle
                      </UnstyledButton>
                    ) : (
                      <span />
                    )}
                    {actions ? (
                      <Box
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {actions}
                      </Box>
                    ) : null}
                  </Group>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    );
  }

  return (
    <Stack gap="sm" aria-label={ariaLabel} role="list">
      {rows.map((row) => {
        const rowKey = getRowKey(row);
        const clickable = Boolean(onRowClick) && (isRowClickable ? isRowClickable(row) : true);
        const actions = mobileCard.actions?.(row) ?? rowActions?.(row);

        return (
          <Paper
            key={rowKey}
            withBorder
            radius="md"
            p="md"
            role="listitem"
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onRowClick?.(row) : undefined}
            onKeyDown={
              clickable ? (event) => handleRowKeyDown(event, row, onRowClick) : undefined
            }
            style={clickable ? { cursor: "pointer" } : undefined}
            aria-label={
              typeof mobileCard.title(row) === "string"
                ? String(mobileCard.title(row))
                : undefined
            }
          >
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                  <Text fw={600} size="sm" lineClamp={2}>
                    {mobileCard.title(row)}
                  </Text>
                  {mobileCard.subtitle ? (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {mobileCard.subtitle(row)}
                    </Text>
                  ) : null}
                </Stack>
                {mobileCard.status?.(row)}
              </Group>

              {primaryFields.length > 0 ? (
                <Stack gap={6}>
                  {primaryFields.map((field) => (
                    <Group key={field.key} justify="space-between" gap="sm" wrap="nowrap">
                      <Text size="xs" c="dimmed">
                        {field.label}
                      </Text>
                      <Text size="sm" ta="right" style={{ minWidth: 0 }}>
                        {field.render(row)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              ) : null}

              {actions ? (
                <Box
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {actions}
                </Box>
              ) : null}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
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
  mobileView = "scroll",
  mobileCard,
  scrollMinWidth,
}: DataTableProps<T>) {
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
