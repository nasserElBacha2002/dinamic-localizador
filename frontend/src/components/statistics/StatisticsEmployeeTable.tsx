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
import { formatDurationFromMinutes } from "../../utils/duration";
import { formatPercent } from "../../utils/export";
import { getApiErrorMessage } from "../../utils/errors";

type SortableField =
  | "employeeName"
  | "phoneNumber"
  | "scheduledWorkdays"
  | "presentWorkdays"
  | "absentWorkdays"
  | "justifiedWorkdays"
  | "expectedOpenWorkdays"
  | "attendanceRate"
  | "onTimeWorkdays"
  | "lateWorkdays"
  | "punctualityRate"
  | "workedMinutes"
  | "overtimeMinutes"
  | "earlyDepartureWorkdays"
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
  loadExportRows: () => Promise<Array<Array<string | number | null | undefined>>>;
  dateFrom?: string;
  dateTo?: string;
  exportsDisabled?: boolean;
}

const EXPORT_HEADERS = [
  "Empleado",
  "Teléfono",
  "Jornadas programadas",
  "Presentes",
  "Ausentes",
  "Justificadas",
  "Pendientes",
  "Presentismo",
  "Puntualidad",
  "Horas trabajadas",
  "Horas extra",
  "Llegadas tarde",
  "Salidas tempranas",
  "Última asistencia",
];

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
  loadExportRows,
  dateFrom,
  dateTo,
  exportsDisabled = false,
}: StatisticsEmployeeTableProps) {
  const columns = useMemo<DataTableColumn<AttendanceByEmployeeRow>[]>(
    () => [
      {
        key: "employeeName",
        header: "Empleado",
        getValue: (row) => row.employeeName,
        sortable: true,
      },
      {
        key: "phoneNumber",
        header: "Teléfono",
        getValue: (row) => row.phoneNumber,
        sortable: true,
      },
      {
        key: "scheduledWorkdays",
        header: "Jornadas",
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
        key: "justifiedWorkdays",
        header: "Justificadas",
        getValue: (row) => row.justifiedWorkdays,
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
        key: "workedMinutes",
        header: "Horas trabajadas",
        getValue: (row) => formatDurationFromMinutes(row.workedMinutes),
        align: "right",
        sortable: true,
      },
      {
        key: "lastAttendanceDate",
        header: "Última asistencia",
        getValue: (row) => (row.lastAttendanceDate ? formatDateTime(row.lastAttendanceDate) : "—"),
        sortable: true,
      },
    ],
    [],
  );

  if (isLoading) {
    return <LoadingState message="Cargando estadísticas por empleado..." />;
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
          loadRows={loadExportRows}
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
        emptyDescription="No hay datos de empleados para los filtros seleccionados."
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
