import { Anchor, Badge, Group, Select, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { Link } from "react-router";
import {
  DataTable,
  ErrorState,
  LoadingState,
  PaginationControls,
  mapApiPaginationMeta,
  type DataTableColumn,
} from "../../design-system";
import { ExportActionButtons } from "./ExportActionButtons";
import { getAttendanceIncidentDetails } from "../../api/statistics.api";
import { useStatisticsIncidentDetails } from "../../hooks/useStatistics";
import type { OperationalIncidentDetailRow, StatisticsFilters } from "../../types/statistics";
import { getApiErrorMessage } from "../../utils/errors";
import { buildOperationDetailHref } from "../../utils/statistics-deep-links";
import { formatDateTime } from "../../utils/dates";
import { operationStatusLabels } from "../../utils/labels";

interface StatisticsIncidentTableProps {
  filters: StatisticsFilters;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  incidentType: string;
  onIncidentTypeChange: (value: string) => void;
  exportsDisabled: boolean;
  isoDateFrom: string;
  isoDateTo: string;
}

const INCIDENT_FILTER_OPTIONS = [
  { value: "", label: "Todas las incidencias" },
  { value: "COVERAGE_REQUIRED", label: "Cobertura / reemplazo" },
  { value: "OPERATION_MODIFIED", label: "Operación modificada" },
  { value: "NOT_CONFIRMED", label: "Sin confirmar" },
  { value: "NOT_CONFIRMED_AND_ABSENT", label: "Sin confirmar y ausente" },
  { value: "MISSING_CHECK_IN", label: "Salida sin llegada" },
  { value: "MISSING_CHECK_OUT", label: "Llegada sin salida" },
  { value: "NO_PUNCH", label: "Sin fichaje" },
];

export function StatisticsIncidentTable({
  filters,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  incidentType,
  onIncidentTypeChange,
  exportsDisabled,
  isoDateFrom,
  isoDateTo,
}: StatisticsIncidentTableProps) {
  const queryFilters: StatisticsFilters = {
    ...filters,
    incidentType: (incidentType || undefined) as StatisticsFilters["incidentType"],
    page,
    limit: pageSize,
  };

  const query = useStatisticsIncidentDetails(queryFilters);
  const rows = query.data?.data ?? [];
  const apiMeta = query.data?.meta ?? {
    page,
    limit: pageSize,
    total: 0,
    totalPages: 0,
  };

  const effectiveLimit = apiMeta.limit ?? pageSize;
  const safeLimit = effectiveLimit > 0 ? effectiveLimit : pageSize || 1;
  const totalCount = apiMeta.total ?? 0;
  const totalPages =
    apiMeta.totalPages ?? Math.max(1, Math.ceil(totalCount / safeLimit));

  const pagination = mapApiPaginationMeta({
    page: apiMeta.page ?? page,
    limit: safeLimit,
    total: totalCount,
    totalPages,
  });

  const columns = useMemo<DataTableColumn<OperationalIncidentDetailRow>[]>(
    () => [
      {
        key: "incident",
        header: "Incidencia",
        render: (row) => <Badge variant="light">{row.incidentLabel}</Badge>,
      },
      {
        key: "date",
        header: "Fecha operativa",
        render: (row) => row.operationalDate,
      },
      {
        key: "service",
        header: "Servicio",
        render: (row) => row.serviceName,
      },
      {
        key: "team",
        header: "Equipo",
        render: (row) => row.workTeamName ?? "—",
      },
      {
        key: "employee",
        header: "Empleado",
        render: (row) => row.employeeName ?? "—",
      },
      {
        key: "operationStatus",
        header: "Estado op.",
        render: (row) =>
          operationStatusLabels[row.operationStatus as keyof typeof operationStatusLabels] ??
          row.operationStatus ??
          "—",
      },
      {
        key: "operation",
        header: "Operación",
        render: (row) => (
          <Anchor component={Link} to={buildOperationDetailHref(row.operationId)} size="sm">
            Ver operación
          </Anchor>
        ),
      },
      {
        key: "confirmation",
        header: "Confirmación",
        render: (row) => row.confirmationStatus ?? "—",
      },
      {
        key: "checkIn",
        header: "Llegada",
        render: (row) => (row.checkInAt ? formatDateTime(row.checkInAt) : "—"),
      },
      {
        key: "checkOut",
        header: "Salida",
        render: (row) => (row.checkOutAt ? formatDateTime(row.checkOutAt) : "—"),
      },
      {
        key: "eventAt",
        header: "Fecha evento",
        render: (row) => (row.eventAt ? formatDateTime(row.eventAt) : "—"),
      },
      {
        key: "reason",
        header: "Motivo",
        render: (row) => row.reason ?? "—",
      },
      {
        key: "actor",
        header: "Actor",
        render: (row) => row.actorName ?? row.actorUserId ?? "—",
      },
      {
        key: "origin",
        header: "Origen",
        render: (row) => row.origin ?? "—",
      },
    ],
    [],
  );

  const loadExportRows = async () => {
    const result = await getAttendanceIncidentDetails({
      ...queryFilters,
      page: 1,
      limit: 10_000,
      export: true,
    });
    return result.data.map((row) => [
      row.incidentLabel,
      row.operationalDate,
      row.serviceName,
      row.workTeamName ?? "",
      row.employeeName ?? "",
      row.operationStatus,
      row.confirmationStatus ?? "",
      row.checkInAt ?? "",
      row.checkOutAt ?? "",
      row.eventAt ?? "",
      row.origin ?? "",
      row.reason ?? "",
      row.actorName ?? row.actorUserId ?? "",
      row.operationId,
    ]);
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Select
          label="Tipo de incidencia"
          data={INCIDENT_FILTER_OPTIONS}
          value={incidentType}
          onChange={(value) => onIncidentTypeChange(value ?? "")}
          clearable
          w={280}
        />
        <ExportActionButtons
          dateFrom={isoDateFrom}
          dateTo={isoDateTo}
          disabled={exportsDisabled}
          targets={[
            {
              label: "Incidencias",
              baseName: "operational-incidents",
              headers: [
                "Incidencia",
                "Fecha operativa",
                "Servicio",
                "Equipo",
                "Empleado",
                "Estado operación",
                "Confirmación",
                "Llegada",
                "Salida",
                "Fecha evento",
                "Origen",
                "Motivo",
                "Actor",
                "Operación ID",
              ],
              loadRows: loadExportRows,
              sheetName: "Incidencias",
            },
          ]}
        />
      </Group>

      <Text size="sm" c="dimmed">
        Detalle trazable de coberturas, modificaciones, falta de confirmación y fichaje incompleto.
        Una operación puede aparecer en varias filas si tuvo múltiples incidencias.
      </Text>

      {query.isError ? <ErrorState message={getApiErrorMessage(query.error)} /> : null}
      {query.isLoading ? <LoadingState /> : null}

      {!query.isLoading && !query.isError ? (
        <>
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(row) => `${row.incidentType}-${row.detailId}`}
            emptyTitle="Sin incidencias en el período"
          />
          <PaginationControls
            meta={pagination}
            onPageChange={onPageChange}
            pageSize={pageSize}
            onPageSizeChange={onPageSizeChange}
            showPageSizeSelector
          />
        </>
      ) : null}
    </Stack>
  );
}
