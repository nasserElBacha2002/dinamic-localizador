import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { Link as RouterLink } from "react-router";
import {
  DataTable,
  LoadingState,
  SectionCard,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { useAbsenceRequests } from "../../hooks/useAbsences";
import { useAttendanceRecords } from "../../hooks/useAttendance";
import type { AbsenceRequestEvent, AbsenceRequestListItem } from "../../types/absence";
import type { AttendanceRecordWithRelations } from "../../types/attendance";
import {
  absenceEventTypeLabels,
  absenceStatusLabels,
  formatAbsenceDate,
} from "../../utils/absence-labels";
import { absenceStatusTone } from "../../utils/absence-status-display";
import { attendanceListDetailPath } from "../../utils/attendance-list-display";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../utils/dates";
import { safeText } from "../../utils/display-safe";
import { employeeWorkdayEffectiveStateLabels } from "../../utils/statistics-display-labels";
import { serializeIdList } from "../../utils/multi-value-filter";

const REQUEST_HISTORY_LIMIT = 10;
const ABSENT_HISTORY_LIMIT = 10;
const MERGED_DISPLAY_LIMIT = 20;

type HistoryKind = "REQUEST" | "ABSENCE" | "EVENT";

interface CollaboratorHistoryRow {
  id: string;
  kind: HistoryKind;
  sortAt: string;
  kindLabel: string;
  summary: string;
  period: string;
  statusLabel: string;
  statusTone?: "neutral" | "success" | "warning" | "danger" | "info";
  requestId?: string;
  detailHref?: string;
}

const kindLabels: Record<HistoryKind, string> = {
  REQUEST: "Solicitud",
  ABSENCE: "Ausente",
  EVENT: "Evento",
};

interface EmployeeAbsenceCollaboratorHistorySectionProps {
  employeeId: string;
  year: number;
  events: AbsenceRequestEvent[];
  currentRequestId?: string;
  canReadAttendance?: boolean;
}

function mapRequestRow(row: AbsenceRequestListItem): CollaboratorHistoryRow {
  return {
    id: `request-${row.id}`,
    kind: "REQUEST",
    sortAt: row.createdAt,
    kindLabel: kindLabels.REQUEST,
    summary: safeText(row.absenceType?.name ?? null),
    period: `${formatAbsenceDate(row.startDate)} – ${formatAbsenceDate(row.endDate)}`,
    statusLabel: absenceStatusLabels[row.status],
    statusTone: absenceStatusTone(row.status),
    requestId: row.id,
  };
}

function mapEventRow(event: AbsenceRequestEvent): CollaboratorHistoryRow {
  const label =
    absenceEventTypeLabels[event.eventType as keyof typeof absenceEventTypeLabels] ??
    event.eventType;
  const commentSuffix = event.comment ? ` · ${event.comment}` : "";
  const performerSuffix = event.performerName ? ` · ${event.performerName}` : "";
  return {
    id: `event-${event.id}`,
    kind: "EVENT",
    sortAt: event.createdAt,
    kindLabel: kindLabels.EVENT,
    summary: `${label}${performerSuffix}${commentSuffix}`,
    period: formatDateTime(event.createdAt),
    statusLabel: label,
    statusTone: "neutral",
  };
}

function mapAbsentRow(row: AttendanceRecordWithRelations): CollaboratorHistoryRow {
  const workDate = row.workDate ?? row.operation?.scheduledStart?.slice(0, 10) ?? row.createdAt;
  const stateLabel =
    employeeWorkdayEffectiveStateLabels.ABSENT ?? row.effectiveState ?? "Ausente";
  return {
    id: `absent-${row.listRowKey ?? row.id}`,
    kind: "ABSENCE",
    sortAt: workDate,
    kindLabel: kindLabels.ABSENCE,
    summary: safeText(row.service?.name ?? row.operation?.scheduledStart ?? null),
    period: formatAbsenceDate(workDate.slice(0, 10)),
    statusLabel: stateLabel,
    statusTone: "danger",
    detailHref: attendanceListDetailPath(row),
  };
}

export function EmployeeAbsenceCollaboratorHistorySection({
  employeeId,
  year,
  events,
  currentRequestId,
  canReadAttendance = false,
}: EmployeeAbsenceCollaboratorHistorySectionProps) {
  const dateFrom = `${year}-01-01`;
  const dateTo = `${year}-12-31`;

  const historyQuery = useAbsenceRequests({
    employeeIds: [employeeId],
    dateFrom,
    dateTo,
    page: 1,
    limit: REQUEST_HISTORY_LIMIT,
  });

  const absentQuery = useAttendanceRecords(
    {
      employeeIds: [employeeId],
      validationStatus: "ABSENT",
      dateFrom: dateInputToIsoStart(dateFrom),
      dateTo: dateInputToIsoEnd(dateTo),
      page: 1,
      limit: ABSENT_HISTORY_LIMIT,
    },
    canReadAttendance,
  );

  const requestsListHref = useMemo(() => {
    const params = new URLSearchParams();
    const serialized = serializeIdList([employeeId]);
    if (serialized) {
      params.set("employeeIds", serialized);
    }
    params.set("status", "all");
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);
    return `/absences?${params.toString()}`;
  }, [dateFrom, dateTo, employeeId]);

  const absentListHref = useMemo(() => {
    const params = new URLSearchParams();
    const serialized = serializeIdList([employeeId]);
    if (serialized) {
      params.set("employeeIds", serialized);
    }
    params.set("validationStatus", "ABSENT");
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);
    params.set("datePreset", "custom");
    return `/attendance?${params.toString()}`;
  }, [dateFrom, dateTo, employeeId]);

  const rows = useMemo(() => {
    const requestRows = (historyQuery.data?.data ?? [])
      .filter((row) => row.id !== currentRequestId)
      .map(mapRequestRow);
    const eventRows = events.map(mapEventRow);
    const absentHistoryRows =
      canReadAttendance && absentQuery.isSuccess
        ? (absentQuery.data?.data ?? []).map(mapAbsentRow)
        : [];

    return [...requestRows, ...eventRows, ...absentHistoryRows]
      .sort((a, b) => b.sortAt.localeCompare(a.sortAt))
      .slice(0, MERGED_DISPLAY_LIMIT);
  }, [
    absentQuery.data?.data,
    absentQuery.isSuccess,
    canReadAttendance,
    currentRequestId,
    events,
    historyQuery.data?.data,
  ]);

  const absentLoadFailed = canReadAttendance && absentQuery.isError;

  const columns = useMemo<DataTableColumn<CollaboratorHistoryRow>[]>(
    () => [
      { key: "kind", header: "Registro", getValue: (row) => row.kindLabel },
      { key: "summary", header: "Detalle", getValue: (row) => row.summary },
      { key: "period", header: "Cuándo", getValue: (row) => row.period },
      {
        key: "status",
        header: "Estado",
        render: (row) =>
          row.kind === "REQUEST" ? (
            <StatusBadge label={row.statusLabel} tone={row.statusTone ?? "neutral"} variant="light" />
          ) : (
            <Text size="sm">{row.statusLabel}</Text>
          ),
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<CollaboratorHistoryRow>>(
    () => ({
      title: (row) => row.summary,
      status: (row) =>
        row.kind === "REQUEST" ? (
          <StatusBadge label={row.statusLabel} tone={row.statusTone ?? "neutral"} variant="light" />
        ) : (
          <Text size="sm">{row.kindLabel}</Text>
        ),
      fields: [
        {
          key: "period",
          label: "Cuándo",
          getValue: (row) => row.period,
          visibility: "always",
        },
        {
          key: "kind",
          label: "Registro",
          getValue: (row) => row.kindLabel,
          visibility: "always",
        },
      ],
    }),
    [],
  );

  const loading =
    historyQuery.isLoading || (canReadAttendance && absentQuery.isLoading);

  const showEmptyState = !loading && rows.length === 0 && !absentLoadFailed;

  return (
    <SectionCard title={`Historial del colaborador (${year})`}>
      {loading ? <LoadingState /> : null}

      {!canReadAttendance ? (
        <Text size="sm" c="dimmed">
          Las inasistencias detectadas en Asistencias no están disponibles con tus permisos actuales.
        </Text>
      ) : null}

      {absentLoadFailed ? (
        <Alert color="yellow" variant="light">
          No se pudieron cargar las inasistencias detectadas.
        </Alert>
      ) : null}

      {showEmptyState ? (
        <Text c="dimmed">No hay solicitudes, inasistencias ni eventos registrados para {year}.</Text>
      ) : null}

      {!loading && rows.length > 0 ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Hasta {REQUEST_HISTORY_LIMIT} solicitudes del año, hasta {ABSENT_HISTORY_LIMIT} inasistencias
            detectadas y los eventos de esta solicitud; la tabla combina hasta {MERGED_DISPLAY_LIMIT}{" "}
            entradas ordenadas por fecha.
          </Text>
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.id}
            aria-label="Historial del colaborador"
            mobileView="cards"
            mobileCard={mobileCard}
            rowActions={(row) => {
              if (row.requestId) {
                return (
                  <Button
                    component={RouterLink}
                    to={`/absences/${row.requestId}`}
                    size="compact-xs"
                    variant="light"
                  >
                    Ver
                  </Button>
                );
              }
              if (row.detailHref) {
                return (
                  <Button
                    component={RouterLink}
                    to={row.detailHref}
                    size="compact-xs"
                    variant="light"
                  >
                    Ver
                  </Button>
                );
              }
              return null;
            }}
            rowActionsHeader="Detalle"
          />
          <Group gap="xs">
            <Button
              component={RouterLink}
              to={requestsListHref}
              size="compact-sm"
              variant="light"
            >
              Ver todas las solicitudes
            </Button>
            {canReadAttendance ? (
              <Button
                component={RouterLink}
                to={absentListHref}
                size="compact-sm"
                variant="light"
              >
                Ver inasistencias
              </Button>
            ) : null}
          </Group>
        </Stack>
      ) : null}
    </SectionCard>
  );
}
