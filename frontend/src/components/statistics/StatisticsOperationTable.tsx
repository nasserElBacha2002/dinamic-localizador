import { Group, Stack } from "@mantine/core";
import { useMemo } from "react";
import {
  DataTable,
  ErrorState,
  LoadingState,
  PaginationControls,
  StatusBadge,
  mapApiPaginationMeta,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { ExportActionButtons } from "./ExportActionButtons";
import type { AttendanceByOperationRow } from "../../types/statistics";
import { formatDateTime } from "../../utils/dates";
import { formatPercent } from "../../utils/export";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { operationStatusLabels } from "../../utils/labels";
import { operationKindLabels } from "../../utils/operation-schedule-display";

type SortableField =
  | "serviceName"
  | "scheduledStart"
  | "operationKind"
  | "scheduledWorkdays"
  | "presentWorkdays"
  | "absentWorkdays"
  | "justifiedWorkdays"
  | "expectedOpenWorkdays"
  | "attendanceRate"
  | "punctualityRate"
  | "workedMinutes"
  | "overtimeMinutes"
  | "operationalStatus";

interface StatisticsOperationTableProps {
  rows: AttendanceByOperationRow[];
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  page: number;
  pageSize: number;
  total: number;
  sortBy: SortableField;
  sortDirection: "asc" | "desc";
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (field: SortableField) => void;
  loadExportRows: () => Promise<Array<Array<string | number | null | undefined>>>;
  dateFrom?: string;
  dateTo?: string;
  exportsDisabled?: boolean;
}

const EXPORT_HEADERS = [
  "Operación",
  "Tipo",
  "Servicio",
  "Dirección",
  "Programado",
  "Jornadas esperadas",
  "Presentes",
  "Ausentes",
  "Justificadas",
  "Pendientes",
  "Presentismo",
  "Puntualidad",
  "Horas trabajadas",
  "Horas extra",
  "Estado",
];

function formatOperationLabel(row: AttendanceByOperationRow): string {
  if (row.operationKind === "RECURRING") {
    return row.serviceName;
  }

  return row.scheduledStart ? formatDateTime(row.scheduledStart) : row.serviceName;
}

export function StatisticsOperationTable({
  rows,
  isLoading,
  isError,
  error,
  page,
  pageSize,
  total,
  sortBy,
  sortDirection,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  loadExportRows,
  dateFrom,
  dateTo,
  exportsDisabled = false,
}: StatisticsOperationTableProps) {
  const columns = useMemo<DataTableColumn<AttendanceByOperationRow>[]>(
    () => [
      {
        key: "operationId",
        header: terminology.operation.singular,
        render: (row) => (
          <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
            {row.operationId.slice(0, 8)}…
          </span>
        ),
      },
      {
        key: "operationKind",
        header: "Tipo",
        getValue: (row) =>
          operationKindLabels[row.operationKind as keyof typeof operationKindLabels] ?? row.operationKind,
        sortable: true,
      },
      {
        key: "serviceName",
        header: terminology.service.singular,
        getValue: (row) => row.serviceName,
        sortable: true,
      },
      {
        key: "scheduledStart",
        header: "Programado",
        getValue: (row) => formatOperationLabel(row),
        sortable: true,
      },
      {
        key: "scheduledWorkdays",
        header: "Jornadas esperadas",
        getValue: (row) => row.scheduledWorkdays,
        align: "right",
        sortable: true,
      },
      {
        key: "presentWorkdays",
        header: "Presentes",
        getValue: (row) => row.presentWorkdays,
        align: "right",
        sortable: true,
      },
      {
        key: "absentWorkdays",
        header: "Ausentes",
        getValue: (row) => row.absentWorkdays,
        align: "right",
        sortable: true,
      },
      {
        key: "attendanceRate",
        header: "Presentismo",
        getValue: (row) => formatPercent(row.attendanceRate),
        align: "right",
        sortable: true,
      },
      {
        key: "punctualityRate",
        header: "Puntualidad",
        getValue: (row) => formatPercent(row.punctualityRate),
        align: "right",
        sortable: true,
      },
      {
        key: "operationalStatus",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={
              operationStatusLabels[row.operationalStatus as keyof typeof operationStatusLabels] ??
              row.operationalStatus
            }
            tone="neutral"
          />
        ),
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<AttendanceByOperationRow>>(
    () => ({
      title: (row) => formatOperationLabel(row),
      subtitle: (row) => row.serviceName,
      status: (row) => (
        <StatusBadge
          label={
            operationStatusLabels[row.operationalStatus as keyof typeof operationStatusLabels] ??
            row.operationalStatus
          }
          tone="neutral"
        />
      ),
      fields: [
        {
          key: "operationKind",
          label: "Tipo",
          getValue: (row) =>
            operationKindLabels[row.operationKind as keyof typeof operationKindLabels] ??
            row.operationKind,
          visibility: "always",
        },
        {
          key: "presentWorkdays",
          label: "Presentes",
          getValue: (row) => String(row.presentWorkdays),
          visibility: "always",
        },
        {
          key: "attendanceRate",
          label: "Presentismo",
          getValue: (row) => formatPercent(row.attendanceRate),
          visibility: "always",
        },
        {
          key: "punctualityRate",
          label: "Puntualidad",
          getValue: (row) => formatPercent(row.punctualityRate),
          visibility: "expanded",
        },
        {
          key: "scheduledWorkdays",
          label: "Jornadas esperadas",
          getValue: (row) => String(row.scheduledWorkdays),
          visibility: "expanded",
        },
      ],
    }),
    [],
  );

  if (isLoading) {
    return <LoadingState message={`Cargando estadísticas por ${terminology.operation.singular.toLowerCase()}...`} />;
  }

  if (isError) {
    return <ErrorState message={getApiErrorMessage(error)} />;
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <ExportActionButtons
          baseName="attendance-by-operation"
          headers={EXPORT_HEADERS}
          loadRows={loadExportRows}
          dateFrom={dateFrom}
          dateTo={dateTo}
          sheetName="Por operación"
          disabled={exportsDisabled}
        />
      </Group>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.operationId}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(key) => onSortChange(key as SortableField)}
        emptyTitle="Sin resultados"
        emptyDescription={`No hay datos de ${terminology.operation.plural.toLowerCase()} para los filtros seleccionados.`}
        mobileView="summary"
        mobileCard={mobileCard}
      />

      <PaginationControls
        meta={mapApiPaginationMeta({
          page,
          limit: pageSize,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        })}
        onPageChange={onPageChange}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        showPageSizeSelector
      />
    </Stack>
  );
}
