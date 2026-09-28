import { Accordion, Button, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { EntityLink } from "../../components/entity-link";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import {
  ManualAttendanceDialog,
  type ManualAttendanceDialogTarget,
} from "../../components/attendance/ManualAttendanceDialog";
import { ReviewAttendanceDialog } from "../../components/attendance/ReviewAttendanceDialog";
import {
  ActionMenu,
  DataTable,
  DetailFieldGrid,
  ErrorState,
  LoadingState,
  PageHeader,
  PaginationControls,
  SectionCard,
  StatusBadge,
  mapApiPaginationMeta,
  type ActionMenuItem,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import {
  useAttendanceAuditLogs,
  useAttendanceRecord,
  useAttendanceReviews,
  useCreateManualAttendance,
  useEditManualAttendance,
  useReviewAttendanceRecord,
} from "../../hooks/useAttendance";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { usePaginationState } from "../../hooks/usePaginationState";
import type { AttendanceAuditLog, AttendanceReview } from "../../types/attendance";
import { formatDateTime } from "../../utils/dates";
import { formatAttendanceArrivalLabel } from "../../utils/attendance-display";
import { terminology } from "../../domain/terminology";
import { getApiErrorCode, getApiErrorMessage, parseApiError } from "../../utils/errors";
import {
  checkoutStatusLabels,
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";
import {
  manualArrivalStatusLabel,
  manualCheckoutStatusLabel,
  registrationSourceLabel,
  resolveManualAttendanceActions,
  type ManualAttendanceAction,
} from "../../utils/manual-attendance-actions";

function manualAuditActionLabel(action: string): string {
  switch (action) {
    case "MANUAL_CHECK_IN":
      return "Registro de llegada";
    case "MANUAL_CHECK_OUT":
      return "Registro de salida";
    case "MANUAL_CHECK_IN_EDIT":
      return "Edición de llegada";
    case "MANUAL_CHECK_OUT_EDIT":
      return "Edición de salida";
    default:
      return action;
  }
}

function formatAuditData(value: Record<string, unknown> | null): string {
  if (!value) {
    return "—";
  }
  const comment = typeof value.comment === "string" ? value.comment : null;
  const parts: string[] = [];
  if (value.receivedAt != null) {
    parts.push(`Llegada: ${formatDateTime(String(value.receivedAt))}`);
  }
  if (value.checkoutAt != null) {
    parts.push(`Salida: ${formatDateTime(String(value.checkoutAt))}`);
  }
  if (value.punctualityStatus != null) {
    parts.push(`Puntualidad: ${String(value.punctualityStatus)}`);
  }
  if (value.checkoutStatus != null) {
    parts.push(`Salida: ${String(value.checkoutStatus)}`);
  }
  if (value.arrivalSource != null) {
    parts.push(`Origen llegada: ${registrationSourceLabel(value.arrivalSource as never)}`);
  }
  if (value.checkoutSource != null) {
    parts.push(`Origen salida: ${registrationSourceLabel(value.checkoutSource as never)}`);
  }
  if (comment) {
    parts.push(`Comentario: ${comment}`);
  }
  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(value);
}

export function AttendanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { goBackToList } = useListBackNavigation("/attendance");
  const pagination = usePaginationState(10);
  const auditPagination = usePaginationState(10);
  const attendanceQuery = useAttendanceRecord(id);
  const reviewsQuery = useAttendanceReviews(id, pagination.page, pagination.pageSize);
  const auditLogsQuery = useAttendanceAuditLogs(id, auditPagination.page, auditPagination.pageSize);
  const reviewMutation = useReviewAttendanceRecord(id ?? "");
  const createManualMutation = useCreateManualAttendance();
  const editManualMutation = useEditManualAttendance();
  const permissionsQuery = useCompanyPermissions();
  const companySettingsQuery = useCompanySettings(true);

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [manualTarget, setManualTarget] = useState<ManualAttendanceDialogTarget | null>(null);

  const openManualTarget = (record: NonNullable<typeof attendanceQuery.data>, action: ManualAttendanceAction) => {
    const initialOccurredAt =
      action.kind === "CHECK_IN" ? record.receivedAt : record.checkoutAt;
    setManualTarget({
      kind: action.kind,
      mode: action.mode,
      operationId: record.operationId,
      employeeId: record.employeeId,
      employeeWorkdayId: record.employeeWorkdayId ?? null,
      attendanceId: record.id,
      employeeName: record.employee.name,
      initialOccurredAt,
      expectedOccurredAt: action.mode === "edit" ? initialOccurredAt : null,
    });
  };

  const reviewColumns = useMemo<DataTableColumn<AttendanceReview>[]>(
    () => [
      {
        key: "decision",
        header: "Decisión",
        getValue: (row) => (row.decision === "APPROVE" ? "Aprobada" : "Rechazada"),
      },
      {
        key: "reviewer",
        header: "Revisor",
        getValue: (row) => row.reviewer?.name ?? row.reviewedBy,
      },
      { key: "createdAt", header: "Fecha", getValue: (row) => formatDateTime(row.createdAt) },
      { key: "reason", header: "Motivo", getValue: (row) => row.reason },
    ],
    [],
  );

  const auditColumns = useMemo<DataTableColumn<AttendanceAuditLog>[]>(
    () => [
      {
        key: "action",
        header: "Acción",
        getValue: (row) => manualAuditActionLabel(row.action),
      },
      {
        key: "user",
        header: "Usuario",
        getValue: (row) => row.userName ?? row.userId ?? "—",
      },
      { key: "createdAt", header: "Fecha", getValue: (row) => formatDateTime(row.createdAt) },
      { key: "reason", header: "Motivo", getValue: (row) => row.reason ?? "—" },
      {
        key: "previous",
        header: "Valor anterior",
        getValue: (row) => formatAuditData(row.previousData),
      },
      {
        key: "next",
        header: "Valor nuevo",
        getValue: (row) => formatAuditData(row.newData),
      },
    ],
    [],
  );

  const reviewMobileCard = useMemo<DataTableMobileCardConfig<AttendanceReview>>(
    () => ({
      title: (row) => (row.decision === "APPROVE" ? "Aprobada" : "Rechazada"),
      fields: [
        {
          key: "reviewer",
          label: "Revisor",
          getValue: (row) => row.reviewer?.name ?? row.reviewedBy,
          visibility: "always",
        },
        {
          key: "createdAt",
          label: "Fecha",
          getValue: (row) => formatDateTime(row.createdAt),
          visibility: "always",
        },
        {
          key: "reason",
          label: "Motivo",
          getValue: (row) => row.reason,
          visibility: "expanded",
        },
      ],
    }),
    [],
  );

  const auditMobileCard = useMemo<DataTableMobileCardConfig<AttendanceAuditLog>>(
    () => ({
      title: (row) => manualAuditActionLabel(row.action),
      fields: [
        {
          key: "user",
          label: "Usuario",
          getValue: (row) => row.userName ?? row.userId ?? "—",
          visibility: "always",
        },
        {
          key: "createdAt",
          label: "Fecha",
          getValue: (row) => formatDateTime(row.createdAt),
          visibility: "always",
        },
        {
          key: "reason",
          label: "Motivo",
          getValue: (row) => row.reason ?? "—",
          visibility: "expanded",
        },
        {
          key: "previous",
          label: "Anterior",
          getValue: (row) => formatAuditData(row.previousData),
          visibility: "expanded",
        },
        {
          key: "next",
          label: "Nuevo",
          getValue: (row) => formatAuditData(row.newData),
          visibility: "expanded",
        },
      ],
    }),
    [],
  );

  if (!id) {
    return <ErrorState message="Registro no encontrado." />;
  }

  if (attendanceQuery.isLoading) {
    return <LoadingState />;
  }

  if (attendanceQuery.isError || !attendanceQuery.data) {
    return (
      <ErrorState message={getApiErrorMessage(attendanceQuery.error, "Registro no encontrado.")} />
    );
  }

  const record = attendanceQuery.data;
  const canReview =
    !record.reviewedAt &&
    (record.validationStatus === "PENDING_REVIEW" || record.validationStatus === "REJECTED");

  const manualActions = resolveManualAttendanceActions(record, {
    permissions: permissionsQuery.data?.permissions,
    allowManualAttendanceCorrections:
      companySettingsQuery.data?.allowManualAttendanceCorrections ?? false,
  });

  const reviews = reviewsQuery.data?.data ?? [];
  const reviewsMeta = reviewsQuery.data?.meta;
  const auditLogs = auditLogsQuery.data?.data ?? [];
  const auditMeta = auditLogsQuery.data?.meta;

  const reviewMenuItems: ActionMenuItem[] = [
    ...manualActions.map((action) => ({
      key: action.key,
      label: action.label,
      onClick: () => openManualTarget(record, action),
    })),
    ...(canReview
      ? [
          {
            key: "reject",
            label: "Rechazar asistencia",
            destructive: true,
            onClick: () => {
              setReviewDecision("REJECT");
              setReviewDialogOpen(true);
            },
          } satisfies ActionMenuItem,
        ]
      : []),
    { key: "back", label: "Volver", onClick: goBackToList },
  ];

  const formatCoordPair = (
    latitude: number | null | undefined,
    longitude: number | null | undefined,
  ) => {
    if (latitude == null || longitude == null) {
      return "—";
    }
    return `${latitude}, ${longitude}`;
  };

  const formatMeters = (value: number | null | undefined) => {
    if (value == null) {
      return "—";
    }
    return `${value.toFixed(1)} m`;
  };

  return (
    <Stack gap="md">
      <PageHeader
        title="Detalle de asistencia"
        description={`${record.employee.name} · Llegada ${formatAttendanceArrivalLabel(record.receivedAt, formatDateTime)}${record.checkoutAt ? ` · Salida ${formatDateTime(record.checkoutAt)}` : ""}`}
        action={
          <ActionMenu
            primary={
              canReview ? (
                <Button
                  onClick={() => {
                    setReviewDecision("APPROVE");
                    setReviewDialogOpen(true);
                  }}
                >
                  Aprobar asistencia
                </Button>
              ) : manualActions[0] ? (
                <Button
                  onClick={() => {
                    openManualTarget(record, manualActions[0]!);
                  }}
                >
                  {manualActions[0]!.label}
                </Button>
              ) : (
                <Button variant="default" onClick={goBackToList}>
                  Volver
                </Button>
              )
            }
            items={reviewMenuItems.filter((item) => {
              if (item.key === "back" && !canReview && manualActions.length === 0) {
                return false;
              }
              if (manualActions[0] && item.key === manualActions[0].key && !canReview) {
                return false;
              }
              return true;
            })}
            menuLabel="Más acciones de la asistencia"
          />
        }
      />

      <SectionCard title="Información general">
        <DetailFieldGrid
          fields={[
            {
              label: terminology.worker.singular,
              value: (
                <EntityLink
                  entityType="employee"
                  entityId={record.employee.id ?? record.employeeId}
                  label={`${record.employee.name} (${record.employee.phoneNumber})`}
                />
              ),
            },
            {
              label: terminology.service.singular,
              value: (
                <EntityLink
                  entityType="service"
                  entityId={record.service.id}
                  label={record.service.name}
                />
              ),
            },
            {
              label: `${terminology.operation.singular} programada`,
              value: (
                <EntityLink
                  entityType="operation"
                  entityId={record.operationId ?? record.operation.id}
                  label={formatDateTime(record.operation.scheduledStart)}
                />
              ),
            },
            {
              label: "Llegada",
              value: formatAttendanceArrivalLabel(record.receivedAt, formatDateTime),
            },
            {
              label: "Estado llegada",
              value: record.receivedAt ? (
                <Group gap="xs" wrap="wrap">
                  <StatusBadge
                    label={manualArrivalStatusLabel(record.punctualityStatus)}
                    tone="neutral"
                  />
                  {record.arrivalSource === "MANUAL" ? (
                    <StatusBadge label="Manual" tone="info" />
                  ) : null}
                </Group>
              ) : (
                "—"
              ),
            },
            {
              label: "Origen llegada",
              value: registrationSourceLabel(record.arrivalSource),
            },
            {
              label: "Registrado por (llegada)",
              value: record.arrivalRegisteredByUser?.name
                ?? (record.arrivalRegisteredBy ? record.arrivalRegisteredBy : "—"),
            },
            {
              label: "Registrado el (llegada)",
              value: formatDateTime(record.arrivalRegisteredAt),
            },
            {
              label: "Salida",
              value: formatDateTime(record.checkoutAt),
            },
            {
              label: "Estado salida",
              value: record.checkoutStatus ? (
                <Group gap="xs" wrap="wrap">
                  <StatusBadge
                    label={manualCheckoutStatusLabel(record.checkoutStatus)}
                    tone="neutral"
                  />
                  {record.checkoutSource === "MANUAL" ? (
                    <StatusBadge label="Manual" tone="info" />
                  ) : null}
                </Group>
              ) : (
                "—"
              ),
            },
            {
              label: "Origen salida",
              value: registrationSourceLabel(record.checkoutSource),
            },
            {
              label: "Registrado por (salida)",
              value: record.checkoutRegisteredByUser?.name
                ?? (record.checkoutRegisteredBy ? record.checkoutRegisteredBy : "—"),
            },
            {
              label: "Registrado el (salida)",
              value: formatDateTime(record.checkoutRegisteredAt),
            },
            {
              label: "Coordenadas llegada",
              value: formatCoordPair(record.receivedLatitude, record.receivedLongitude),
            },
            { label: "Distancia llegada", value: formatMeters(record.distanceMeters) },
            {
              label: "Coordenadas salida",
              value: formatCoordPair(record.checkoutLatitude, record.checkoutLongitude),
            },
            {
              label: "Distancia salida",
              value: formatMeters(record.checkoutDistanceMeters),
            },
            {
              label: "Radio permitido",
              value:
                record.service.allowedRadiusMeters != null
                  ? `${record.service.allowedRadiusMeters} m`
                  : "—",
            },
            {
              label: "Validación detallada",
              value: (
                <Group gap="xs" wrap="wrap">
                  <StatusBadge label={validationStatusLabels[record.validationStatus]} tone="neutral" />
                  <StatusBadge label={locationStatusLabels[record.locationStatus]} tone="neutral" />
                  <StatusBadge
                    label={punctualityStatusLabels[record.punctualityStatus]}
                    tone="neutral"
                  />
                  {record.checkoutStatus ? (
                    <StatusBadge
                      label={checkoutStatusLabels[record.checkoutStatus]}
                      tone="neutral"
                    />
                  ) : null}
                  {record.isSimulation ? <StatusBadge label="Simulación" tone="info" /> : null}
                </Group>
              ),
            },
            { label: "Motivo original", value: record.validationReason ?? "—" },
            { label: "Motivo salida", value: record.checkoutReviewReason ?? "—" },
            {
              label: "Revisado",
              value: record.reviewedAt ? formatDateTime(record.reviewedAt) : "—",
            },
            { label: "Motivo de revisión", value: record.reviewReason ?? "—" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Historial de revisión">
        <DataTable
          rows={reviews}
          columns={reviewColumns}
          getRowKey={(row) => row.id}
          loading={reviewsQuery.isLoading}
          error={
            reviewsQuery.isError
              ? getApiErrorMessage(reviewsQuery.error, "No se pudo cargar el historial.")
              : undefined
          }
          emptyTitle="Sin revisiones"
          emptyDescription="Todavía no hay revisiones registradas para esta asistencia."
          mobileView="summary"
          mobileCard={reviewMobileCard}
          aria-label="Historial de revisión de asistencia"
        />
        {reviewsMeta ? (
          <PaginationControls
            meta={mapApiPaginationMeta({
              page: reviewsMeta.page,
              limit: reviewsMeta.limit,
              total: reviewsMeta.total,
              totalPages: reviewsMeta.totalPages,
            })}
            onPageChange={pagination.onPageChange}
            pageSize={pagination.pageSize}
            onPageSizeChange={pagination.onPageSizeChange}
            showPageSizeSelector
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Historial de cambios">
        <DataTable
          rows={auditLogs}
          columns={auditColumns}
          getRowKey={(row) => row.id}
          loading={auditLogsQuery.isLoading}
          error={
            auditLogsQuery.isError
              ? getApiErrorMessage(auditLogsQuery.error, "No se pudo cargar el historial de cambios.")
              : undefined
          }
          emptyTitle="Sin cambios"
          emptyDescription="Todavía no hay correcciones manuales registradas para esta asistencia."
          mobileView="summary"
          mobileCard={auditMobileCard}
          aria-label="Historial de cambios de asistencia"
        />
        {auditMeta ? (
          <PaginationControls
            meta={mapApiPaginationMeta({
              page: auditMeta.page,
              limit: auditMeta.limit,
              total: auditMeta.total,
              totalPages: auditMeta.totalPages,
            })}
            onPageChange={auditPagination.onPageChange}
            pageSize={auditPagination.pageSize}
            onPageSizeChange={auditPagination.onPageSizeChange}
            showPageSizeSelector
          />
        ) : null}
      </SectionCard>

      <Accordion variant="contained">
        <Accordion.Item value="technical">
          <Accordion.Control>Detalles técnicos</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Text size="sm">MessageSid: {record.technical.sourceMessageSid ?? "—"}</Text>
              <Text size="sm">Teléfono: {record.technical.phoneNumber ?? "—"}</Text>
              <Text size="sm">
                Mensaje: {record.technical.message?.body ?? "—"} (
                {record.technical.message?.messageType ?? "—"})
              </Text>
              <Text size="sm">
                Fecha del mensaje:{" "}
                {record.technical.message?.createdAt
                  ? formatDateTime(record.technical.message.createdAt)
                  : "—"}
              </Text>
              <Text size="sm">
                Estado de procesamiento: {record.technical.message?.processingStatus ?? "—"}
              </Text>
              <Text size="sm">
                Sesión: {record.technical.session?.state ?? "—"} · expira{" "}
                {record.technical.session?.expiresAt
                  ? formatDateTime(record.technical.session.expiresAt)
                  : "—"}
              </Text>
              <Text size="sm">
                Coordenadas:{" "}
                {formatCoordPair(
                  record.technical.coordinates.latitude,
                  record.technical.coordinates.longitude,
                )}
              </Text>
              <Text size="sm">
                Distancia calculada: {formatMeters(record.technical.distanceMeters)}
              </Text>
              <Text size="sm">Razón de validación: {record.technical.validationReason ?? "—"}</Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <ReviewAttendanceDialog
        open={reviewDialogOpen}
        decision={reviewDecision}
        loading={reviewMutation.isPending}
        onClose={() => setReviewDialogOpen(false)}
        onConfirm={async (input) => {
          try {
            await reviewMutation.mutateAsync(input);
            setReviewDialogOpen(false);
            notifications.show({
              color: "green",
              message: "Revisión registrada correctamente.",
            });
          } catch (error) {
            notifications.show({
              color: "red",
              message: getApiErrorMessage(error),
            });
          }
        }}
      />

      <ManualAttendanceDialog
        open={Boolean(manualTarget)}
        target={manualTarget}
        loading={createManualMutation.isPending || editManualMutation.isPending}
        onClose={() => setManualTarget(null)}
        onConfirm={async (input) => {
          try {
            if (input.mode === "edit") {
              if (!input.expectedOccurredAt) {
                throw new Error("Faltan datos de concurrencia para editar la asistencia.");
              }
              await editManualMutation.mutateAsync({
                attendanceId: input.attendanceId ?? record.id,
                input: {
                  kind: input.kind,
                  occurredAt: input.occurredAt,
                  expectedOccurredAt: input.expectedOccurredAt,
                  reason: input.reason,
                  comment: input.comment,
                },
              });
            } else {
              const employeeWorkdayId =
                input.employeeWorkdayId ?? record.employeeWorkdayId ?? undefined;
              if (!employeeWorkdayId) {
                throw new Error("Falta la jornada del colaborador para registrar la asistencia.");
              }
              await createManualMutation.mutateAsync({
                kind: input.kind,
                operationId: input.operationId,
                employeeId: input.employeeId,
                employeeWorkdayId,
                occurredAt: input.occurredAt,
                reason: input.reason,
                comment: input.comment,
              });
            }
            setManualTarget(null);
            notifications.show({
              color: "green",
              message: "Asistencia manual guardada correctamente.",
            });
          } catch (error) {
            const code = getApiErrorCode(parseApiError(error));
            if (
              code === "ATTENDANCE_CONCURRENT_MODIFICATION" ||
              code === "ARRIVAL_ALREADY_EXISTS" ||
              code === "CHECKOUT_ALREADY_EXISTS"
            ) {
              await attendanceQuery.refetch();
              setManualTarget(null);
            }
            notifications.show({
              color: "red",
              message: getApiErrorMessage(error),
            });
            throw error;
          }
        }}
      />
    </Stack>
  );
}
