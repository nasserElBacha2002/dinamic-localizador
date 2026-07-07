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
import { formatDurationFromMinutes } from "../../utils/duration";
import { formatPercent } from "../../utils/export";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

type SortableField =
  | "serviceName"
  | "address"
  | "totalOperations"
  | "scheduledWorkdays"
  | "presentWorkdays"
  | "absentWorkdays"
  | "justifiedWorkdays"
  | "expectedOpenWorkdays"
  | "attendanceRate"
  | "punctualityRate"
  | "workedMinutes"
  | "overtimeMinutes";

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
  loadExportRows: () => Promise<Array<Array<string | number | null | undefined>>>;
  dateFrom?: string;
  dateTo?: string;
  exportsDisabled?: boolean;
}

const EXPORT_HEADERS = [
  "Servicio",
  "Dirección",
  "Operaciones",
  "Jornadas programadas",
  "Presentes",
  "Ausentes",
  "Justificadas",
  "Pendientes",
  "Presentismo",
  "Puntualidad",
  "Horas trabajadas",
  "Horas extra",
];

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
  loadExportRows,
  dateFrom,
  dateTo,
  exportsDisabled = false,
}: StatisticsLocationTableProps) {
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
        sortable: true,
      },
      {
        key: "totalOperations",
        header: terminology.operation.plural,
        getValue: (row) => row.totalOperations,
        align: "right",
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
          loadRows={loadExportRows}
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
