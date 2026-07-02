import { Group, Stack } from "@mantine/core";
import { useMemo } from "react";
import {
  DataTable,
  ErrorState,
  LoadingState,
  PaginationControls,
  mapApiPaginationMeta,
  type DataTableColumn,
} from "../../design-system";
import { ExportActionButtons } from "./ExportActionButtons";
import type { AttendanceByEmployeeRow } from "../../types/statistics";
import { formatDateTime } from "../../utils/dates";
import { formatPercent } from "../../utils/export";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

type SortableField =
  | "employeeName"
  | "phoneNumber"
  | "assignedInventoriesCount"
  | "confirmedAttendances"
  | "noShowCount"
  | "lateCount"
  | "outsideGeofenceCount"
  | "pendingReviewCount"
  | "attendancePercentage"
  | "lastAttendanceDate";

interface StatisticsEmployeeTableProps {
  rows: AttendanceByEmployeeRow[];
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
  exportRows: AttendanceByEmployeeRow[];
  dateFrom?: string;
  dateTo?: string;
  exportsDisabled?: boolean;
}

const EXPORT_HEADERS = [
  "Empleado",
  "Teléfono",
  "Inventarios asignados",
  "Confirmadas",
  "Sin asistencia",
  "Tarde",
  "Fuera de geocerca",
  "Pendiente",
  "% asistencia",
  "Última asistencia",
];

function toExportRows(rows: AttendanceByEmployeeRow[]) {
  return rows.map((row) => [
    row.employeeName,
    row.phoneNumber,
    row.assignedInventoriesCount,
    row.confirmedAttendances,
    row.noShowCount,
    row.lateCount,
    row.outsideGeofenceCount,
    row.pendingReviewCount,
    formatPercent(row.attendancePercentage),
    row.lastAttendanceDate ? formatDateTime(row.lastAttendanceDate) : "—",
  ]);
}

export function StatisticsEmployeeTable({
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
}: StatisticsEmployeeTableProps) {
  const exportData = useMemo(() => toExportRows(exportRows), [exportRows]);

  const columns = useMemo<DataTableColumn<AttendanceByEmployeeRow>[]>(
    () => [
      {
        key: "employeeName",
        header: terminology.worker.singular,
        getValue: (row) => row.employeeName,
        sortable: true,
      },
      { key: "phoneNumber", header: "Teléfono", getValue: (row) => row.phoneNumber },
      {
        key: "assignedInventoriesCount",
        header: terminology.operation.plural,
        getValue: (row) => row.assignedInventoriesCount,
        align: "right",
      },
      {
        key: "confirmedAttendances",
        header: "Confirmadas",
        getValue: (row) => row.confirmedAttendances,
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
        key: "lastAttendanceDate",
        header: "Última asistencia",
        getValue: (row) =>
          row.lastAttendanceDate ? formatDateTime(row.lastAttendanceDate) : "—",
      },
    ],
    [],
  );

  if (isLoading) {
    return <LoadingState message={`Cargando estadísticas por ${terminology.worker.singular.toLowerCase()}...`} />;
  }

  if (isError) {
    return <ErrorState message={getApiErrorMessage(error)} />;
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <ExportActionButtons
          baseName="attendance-by-employee"
          headers={EXPORT_HEADERS}
          rows={exportData}
          dateFrom={dateFrom}
          dateTo={dateTo}
          sheetName="Por empleado"
          disabled={exportsDisabled}
        />
      </Group>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.employeeId}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(key) => onSortChange(key as SortableField)}
        emptyTitle="Sin resultados"
        emptyDescription={`No hay datos de ${terminology.worker.plural.toLowerCase()} para los filtros seleccionados.`}
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
