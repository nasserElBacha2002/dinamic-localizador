import { Button } from "@mantine/core";
import { Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  DataTable,
  LoadingState,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import { useAbsenceRequests } from "../../hooks/useAbsences";
import type { AbsenceRequestListItem } from "../../types/absence";
import { absenceStatusLabels, formatAbsenceDate } from "../../utils/absence-labels";

interface EmployeeAbsenceHistoryTableProps {
  employeeId: string;
  year: number;
}

export function EmployeeAbsenceHistoryTable({ employeeId, year }: EmployeeAbsenceHistoryTableProps) {
  const historyQuery = useAbsenceRequests({
    employeeId,
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
    page: 1,
    limit: 10,
  });

  const listHref = `/absences?employeeId=${employeeId}&dateFrom=${year}-01-01&dateTo=${year}-12-31`;

  const columns = useMemo<DataTableColumn<AbsenceRequestListItem>[]>(
    () => [
      { key: "type", header: "Tipo", getValue: (row) => row.absenceType.name },
      {
        key: "period",
        header: "Período",
        getValue: (row) => `${formatAbsenceDate(row.startDate)} - ${formatAbsenceDate(row.endDate)}`,
      },
      { key: "totalDays", header: "Días", align: "right", getValue: (row) => row.totalDays },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge label={absenceStatusLabels[row.status]} tone="neutral" variant="light" />
        ),
      },
    ],
    [],
  );

  if (historyQuery.isLoading) {
    return <LoadingState />;
  }

  const rows = historyQuery.data?.data ?? [];

  if (rows.length === 0) {
    return <Text c="dimmed">No hay solicitudes de ausencia registradas para {year}.</Text>;
  }

  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        Mostrando las últimas 10 solicitudes del año.
      </Text>
      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.id}
        aria-label="Historial de ausencias del empleado"
        rowActions={(row) => (
          <RouterLink to={`/absences/${row.id}`}>Ver</RouterLink>
        )}
        rowActionsHeader="Detalle"
      />
      <Button component={RouterLink} to={listHref} size="compact-sm" variant="light" style={{ alignSelf: "flex-start" }}>
        Ver todas las solicitudes
      </Button>
    </Stack>
  );
}
