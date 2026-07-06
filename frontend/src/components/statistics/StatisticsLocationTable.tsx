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
import type { AttendanceByServiceRow } from "../../types/statistics";
import { formatPercent } from "../../utils/export";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

type SortableField =
  | "serviceName"
  | "address"
  | "totalOperations"
  | "averageAttendancePercentage"
  | "totalAssignedEmployees"
  | "totalConfirmedAttendances"
  | "totalNoShows"
  | "totalLateRecords"
  | "totalOutsideGeofenceRecords"
  | "totalManualReviews";

interface StatisticsLocationTableProps {
  rows: AttendanceByServiceRow[];
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
  exportRows: AttendanceByServiceRow[];
  dateFrom?: string;
  dateTo?: string;
  exportsDisabled?: boolean;
}

const EXPORT_HEADERS = [
  "Servicio",
  "Dirección",
  "Operaciones",
  "% asistencia promedio",
  "Empleados asignados",
  "Confirmadas",
  "Sin asistencia",
  "Tarde",
  "Fuera geocerca",
  "Revisiones manuales",
];

function toExportRows(rows: AttendanceByServiceRow[]) {
  return rows.map((row) => [
    row.serviceName,
    row.address ?? "",
    row.totalOperations,
    formatPercent(row.averageAttendancePercentage),
    row.totalAssignedEmployees,
    row.totalConfirmedAttendances,
    row.totalNoShows,
    row.totalLateRecords,
    row.totalOutsideGeofenceRecords,
    row.totalManualReviews,
  ]);
}

export function StatisticsLocationTable({
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
}: StatisticsLocationTableProps) {
  const exportData = useMemo(() => toExportRows(exportRows), [exportRows]);

  const columns = useMemo<DataTableColumn<AttendanceByServiceRow>[]>(
    () => [
      {
        key: "serviceName",
        header: terminology.service.singular,
        getValue: (row) => row.serviceName,
        sortable: true,
      },
      {
        key: "address",
        header: "Dirección",
        getValue: (row) => row.address ?? "—",
      },
      {
        key: "totalOperations",
        header: terminology.operation.plural,
        getValue: (row) => row.totalOperations,
        align: "right",
      },
      {
        key: "averageAttendancePercentage",
        header: "% promedio",
        getValue: (row) => formatPercent(row.averageAttendancePercentage),
        align: "right",
      },
      {
        key: "totalAssignedEmployees",
        header: "Asignados",
        getValue: (row) => row.totalAssignedEmployees,
        align: "right",
      },
      {
        key: "totalConfirmedAttendances",
        header: "Confirmadas",
        getValue: (row) => row.totalConfirmedAttendances,
        align: "right",
      },
      {
        key: "totalNoShows",
        header: "Sin asistencia",
        getValue: (row) => row.totalNoShows,
        align: "right",
      },
      {
        key: "totalLateRecords",
        header: "Tarde",
        getValue: (row) => row.totalLateRecords,
        align: "right",
      },
      {
        key: "totalOutsideGeofenceRecords",
        header: "Fuera geocerca",
        getValue: (row) => row.totalOutsideGeofenceRecords,
        align: "right",
      },
      {
        key: "totalManualReviews",
        header: "Revisiones",
        getValue: (row) => row.totalManualReviews,
        align: "right",
      },
    ],
    [],
  );

  if (isLoading) {
    return <LoadingState message={`Cargando estadísticas por ${terminology.service.singular.toLowerCase()}...`} />;
  }

  if (isError) {
    return <ErrorState message={getApiErrorMessage(error)} />;
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <ExportActionButtons
          baseName="attendance-by-service"
          headers={EXPORT_HEADERS}
          rows={exportData}
          dateFrom={dateFrom}
          dateTo={dateTo}
          sheetName="Por servicio"
          disabled={exportsDisabled}
        />
      </Group>

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.serviceId}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(key) => onSortChange(key as SortableField)}
        emptyTitle="Sin resultados"
        emptyDescription={`No hay datos de ${terminology.service.plural.toLowerCase()} para los filtros seleccionados.`}
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
