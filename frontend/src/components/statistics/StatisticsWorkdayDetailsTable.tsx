import { Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import {
  DataTable,
  ErrorState,
  LoadingState,
  PaginationControls,
  mapApiPaginationMeta,
  type DataTableColumn,
} from "../../design-system";
import type { AttendanceWorkdayDetailRow } from "../../types/statistics";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { operationKindLabels } from "../../utils/operation-schedule-display";
import {
  checkoutStatusLabels,
  punctualityStatusLabels,
} from "../../utils/labels";
import { employeeWorkdayEffectiveStateLabels } from "../../utils/statistics-display-labels";

interface StatisticsWorkdayDetailsTableProps {
  rows: AttendanceWorkdayDetailRow[];
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

function formatTurno(row: AttendanceWorkdayDetailRow): string {
  const name = row.shiftNameSnapshot?.trim();
  if (!name) {
    return "—";
  }
  return name;
}

export function StatisticsWorkdayDetailsTable({
  rows,
  isLoading,
  isError,
  error,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: StatisticsWorkdayDetailsTableProps) {
  const columns = useMemo<DataTableColumn<AttendanceWorkdayDetailRow>[]>(
    () => [
      {
        key: "workDate",
        header: "Fecha",
        getValue: (row) => row.workDate,
      },
      {
        key: "employeeName",
        header: "Empleado",
        getValue: (row) => row.employeeName,
      },
      {
        key: "serviceName",
        header: "Servicio",
        getValue: (row) => row.serviceName,
      },
      {
        key: "operationKind",
        header: "Tipo",
        getValue: (row) => operationKindLabels[row.operationKind] ?? row.operationKind,
      },
      {
        key: "turno",
        header: "Turno",
        getValue: (row) => formatTurno(row),
        render: (row) => (
          <Text size="sm" c={row.shiftNameSnapshot ? undefined : "dimmed"}>
            {formatTurno(row)}
          </Text>
        ),
      },
      {
        key: "effectiveState",
        header: "Estado",
        getValue: (row) =>
          employeeWorkdayEffectiveStateLabels[row.effectiveState] ?? row.effectiveState,
      },
      {
        key: "expectedStartAt",
        header: "Ingreso esperado",
        getValue: (row) => formatDateTime(row.expectedStartAt),
      },
      {
        key: "checkInAt",
        header: "Ingreso",
        getValue: (row) => formatDateTime(row.checkInAt),
      },
      {
        key: "arrivalStatus",
        header: "Llegada",
        getValue: (row) =>
          row.arrivalStatus ? (punctualityStatusLabels[row.arrivalStatus] ?? row.arrivalStatus) : "—",
      },
      {
        key: "checkOutAt",
        header: "Salida",
        getValue: (row) => formatDateTime(row.checkOutAt),
      },
      {
        key: "checkoutStatus",
        header: "Salida (estado)",
        getValue: (row) =>
          row.checkoutStatus ? (checkoutStatusLabels[row.checkoutStatus] ?? row.checkoutStatus) : "—",
      },
    ],
    [],
  );

  if (isLoading) {
    return <LoadingState message="Cargando detalle de jornadas..." />;
  }

  if (isError) {
    return <ErrorState message={getApiErrorMessage(error)} />;
  }

  const paginationMeta = mapApiPaginationMeta({
    page,
    limit: pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / Math.max(pageSize, 1))),
  });

  return (
    <Stack gap="sm">
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) =>
          `${row.workDate}-${row.employeeName}-${row.serviceName}-${row.operationShiftId ?? "single"}`
        }
        emptyTitle="Sin jornadas"
        emptyDescription="No hay jornadas para los filtros seleccionados."
      />
      <PaginationControls
        meta={paginationMeta}
        onPageChange={onPageChange}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        showPageSizeSelector
      />
    </Stack>
  );
}
