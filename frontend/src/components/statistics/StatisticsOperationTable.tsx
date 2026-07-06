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
} from "../../design-system";
import { ExportActionButtons } from "./ExportActionButtons";
import type { AttendanceByOperationRow } from "../../types/statistics";
import { formatDateTime } from "../../utils/dates";
import { formatPercent } from "../../utils/export";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { operationStatusLabels } from "../../utils/labels";

type SortableField =
  | "serviceName"
  | "scheduledStart"
  | "assignedEmployeesCount"
  | "presentCount"
  | "noShowCount"
  | "lateCount"
  | "outsideGeofenceCount"
  | "pendingReviewCount"
  | "attendancePercentage"
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
  exportRows: AttendanceByOperationRow[];
  dateFrom?: string;
  dateTo?: string;
  exportsDisabled?: boolean;
}

const EXPORT_HEADERS = [
  "Operación",
  "Servicio",
  "Dirección",
  "Programado",
  "Asignados",
  "Presentes",
  "Sin asistencia",
  "Tarde",
  "Fuera geocerca",
  "Pendiente",
  "% asistencia",
  "Estado",
];

function toExportRows(rows: AttendanceByOperationRow[]) {
  return rows.map((row) => [
    row.operationId,
    row.serviceName,
    row.serviceAddress ?? "",
    formatDateTime(row.scheduledStart),
    row.assignedEmployeesCount,
    row.presentCount,
    row.noShowCount,
    row.lateCount,
    row.outsideGeofenceCount,
    row.pendingReviewCount,
    formatPercent(row.attendancePercentage),
    operationStatusLabels[row.operationalStatus as keyof typeof operationStatusLabels] ?? row.operationalStatus,
  ]);
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
  exportRows,
  dateFrom,
  dateTo,
  exportsDisabled = false,
}: StatisticsOperationTableProps) {
  const exportData = useMemo(() => toExportRows(exportRows), [exportRows]);

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
        key: "serviceName",
        header: terminology.service.singular,
        getValue: (row) => row.serviceName,
        sortable: true,
      },
      {
        key: "serviceAddress",
        header: "Dirección",
        getValue: (row) => row.serviceAddress ?? "—",
      },
      {
        key: "scheduledStart",
        header: "Programado",
        getValue: (row) => formatDateTime(row.scheduledStart),
      },
      {
        key: "assignedEmployeesCount",
        header: "Asignados",
        getValue: (row) => row.assignedEmployeesCount,
        align: "right",
      },
      {
        key: "presentCount",
        header: "Presentes",
        getValue: (row) => row.presentCount,
        align: "right",
      },
      {
        key: "noShowCount",
        header: "Sin asistencia",
        getValue: (row) => row.noShowCount,
        align: "right",
      },
      { key: "lateCount", header: "Tarde", getValue: (row) => row.lateCount, align: "right" },
      {
        key: "outsideGeofenceCount",
        header: "Fuera geocerca",
        getValue: (row) => row.outsideGeofenceCount,
        align: "right",
      },
      {
        key: "pendingReviewCount",
        header: "Pendiente",
        getValue: (row) => row.pendingReviewCount,
        align: "right",
      },
      {
        key: "attendancePercentage",
        header: "% asistencia",
        getValue: (row) => formatPercent(row.attendancePercentage),
        align: "right",
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
          rows={exportData}
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
