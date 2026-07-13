import { Anchor, Box, Button, Group, SimpleGrid, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCompanyWorkSchedule } from "../../hooks/useCompanyWorkSchedule";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useCompanySettings } from "../../hooks/useCompanySettings";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusBadge,
  type StatusBadgeTone,
} from "../../design-system";
import { OperationTeamSection } from "../../components/operations/OperationTeamSection";
import { OperationDetailFieldGrid } from "../../components/operations/OperationDetailFieldGrid";
import { OperationForm, OPERATION_DETAIL_FORM_ID } from "../../components/operations/OperationForm";
import { OperationScheduledWorkdaysSection } from "../../components/operations/OperationScheduledWorkdaysSection";
import layoutClasses from "../../components/operations/operation-detail-layout.module.css";
import {
  useCancelOperation,
  useOperation,
  useOperationWorkdays,
  useUpdateOperation,
} from "../../hooks/useOperations";
import type { OperationFormValues } from "../../schemas/operation.schema";
import type { OperationStatus } from "../../types/operation";
import { formatDateTime } from "../../utils/dates";
import { operationScheduleLabel, terminology } from "../../domain/terminology";
import { getApiErrorMessage, isRecurringWorkdaySyncError } from "../../utils/errors";
import { hasPermission } from "../../utils/permissions";
import { isOperationAssignable, isOperationEditable } from "../../utils/operation-status";
import {
  buildOperationEditDefaultValues,
  formatOperationDetailScheduleTitle,
  resolveOperationReferenceDate,
  toOperationUpdatePayload,
} from "../../utils/operation-detail-display";
import {
  formatRecurringValidity,
  operationKindLabels,
} from "../../utils/operation-schedule-display";
import {
  getOperationalTodayDate,
  pickDefaultTeamWorkday,
  type OperationTeamWorkdaySelection,
} from "../../utils/operation-team-workday";
import { operationStatusLabels } from "../../utils/labels";

const DEFAULT_OPERATION_TIMEZONE = "America/Argentina/Buenos_Aires";

function operationStatusTone(status: OperationStatus): StatusBadgeTone {
  switch (status) {
    case "SCHEDULED":
      return "info";
    case "IN_PROGRESS":
      return "warning";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "danger";
    default:
      return "neutral";
  }
}

export function OperationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { goBackToList } = useListBackNavigation("/operations");
  const operationQuery = useOperation(id);
  const companyWorkScheduleQuery = useCompanyWorkSchedule(Boolean(id));
  const companySettingsQuery = useCompanySettings(Boolean(id));
  const permissionsQuery = useCompanyPermissions();
  const updateMutation = useUpdateOperation(id ?? "");
  const cancelMutation = useCancelOperation();

  const [editing, setEditing] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [teamWorkday, setTeamWorkday] = useState<OperationTeamWorkdaySelection | null>(null);

  const operation = operationQuery.data;
  const isRecurring = operation?.operationKind === "RECURRING";
  const operationalTimezone =
    companySettingsQuery.data?.operationTimezone ?? DEFAULT_OPERATION_TIMEZONE;
  const operationalToday = useMemo(
    () => getOperationalTodayDate(operationalTimezone),
    [operationalTimezone],
  );
  const teamWorkdaysQuery = useOperationWorkdays(
    isRecurring ? operation?.id : undefined,
    { page: 1, limit: 90 },
  );
  const teamWorkdayOptions = teamWorkdaysQuery.data?.data ?? [];

  useEffect(() => {
    if (!isRecurring) {
      setTeamWorkday(null);
      return;
    }

    if (
      teamWorkday &&
      teamWorkdayOptions.some((workday) => workday.id === teamWorkday.workdayId)
    ) {
      return;
    }

    setTeamWorkday(pickDefaultTeamWorkday(teamWorkdayOptions, operationalToday));
  }, [isRecurring, operation?.id, teamWorkdayOptions, operationalToday, teamWorkday]);

  const showFeedback = (message: string, severity: "success" | "error" = "success") => {
    notifications.show({ color: severity === "error" ? "red" : "green", message });
  };

  const operationWorkDate = useMemo(
    () => (operation ? resolveOperationReferenceDate(operation) : ""),
    [operation],
  );

  if (!id) {
    return <ErrorState message={`${terminology.operation.singular} no encontrada.`} />;
  }

  if (operationQuery.isLoading) {
    return <LoadingState />;
  }

  if (operationQuery.isError || !operation) {
    return (
      <ErrorState
        message={getApiErrorMessage(
          operationQuery.error,
          `${terminology.operation.singular} no encontrada.`,
        )}
      />
    );
  }

  const canManage = hasPermission(permissionsQuery.data?.permissions, "operations:manage");
  const canAssign = canManage && isOperationAssignable(operation.status);
  const canEdit = isOperationEditable(operation.status);
  const serviceDisplayName = operation.service?.name ?? "—";
  const serviceDetailId = operation.serviceId || operation.service?.id;
  const serviceFieldValue =
    serviceDetailId && serviceDisplayName !== "—" ? (
      <Anchor component={RouterLink} to={`/services/${serviceDetailId}`} size="sm">
        {serviceDisplayName}
      </Anchor>
    ) : (
      serviceDisplayName
    );

  const geofenceSummary = operation.service?.allowedRadiusMeters
    ? `${operation.service.allowedRadiusMeters} m · tolerancias ${operation.earlyToleranceMinutes}/${operation.lateToleranceMinutes} min`
    : `Tolerancias ${operation.earlyToleranceMinutes}/${operation.lateToleranceMinutes} min`;

  const handleUpdate = async (values: OperationFormValues) => {
    setErrorMessage(null);

    try {
      await updateMutation.mutateAsync(toOperationUpdatePayload(operation, values));
      setEditing(false);
      showFeedback(`${terminology.operation.singular} actualizada correctamente.`);
    } catch (error) {
      if (isRecurringWorkdaySyncError(error)) {
        setEditing(false);
        showFeedback(getApiErrorMessage(error), "error");
        return;
      }
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(id);
      setConfirmCancelOpen(false);
      showFeedback(`${terminology.operation.singular} cancelada.`);
    } catch (error) {
      showFeedback(getApiErrorMessage(error), "error");
    }
  };

  return (
    <>
      <PageHeader
        title={`Detalle de la ${terminology.operation.singular.toLowerCase()}`}
        description={formatOperationDetailScheduleTitle(operation)}
        action={
          <Group gap="sm" wrap="wrap">
            {editing && canEdit ? (
              <Button
                type="submit"
                form={OPERATION_DETAIL_FORM_ID}
                loading={updateMutation.isPending}
              >
                Guardar cambios
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                variant="default"
                onClick={() => {
                  setEditing((current) => !current);
                  setErrorMessage(null);
                }}
              >
                {editing ? "Cancelar edición" : `Editar ${terminology.operation.singular.toLowerCase()}`}
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="default" color="danger" onClick={() => setConfirmCancelOpen(true)}>
                {`Cancelar ${terminology.operation.singular.toLowerCase()}`}
              </Button>
            ) : null}
            <Button variant="default" onClick={goBackToList}>
              Volver al listado
            </Button>
          </Group>
        }
      />

      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <MetricCard
            title="Estado"
            value={
              <StatusBadge
                label={operationStatusLabels[operation.status]}
                tone={operationStatusTone(operation.status)}
              />
            }
            description={operationKindLabels[operation.operationKind ?? "ONE_TIME"]}
          />
          <MetricCard
            title={terminology.service.singular}
            value={serviceDisplayName}
            description={operation.service?.address ?? "Sin dirección"}
          />
          <MetricCard
            title="Colaboradores asignados"
            value={operation.assignedEmployees.length}
            description="Dotación actual de la operación"
          />
          <MetricCard
            title="Asistencias registradas"
            value={operation.attendanceRecordsCount}
            description={geofenceSummary}
          />
        </SimpleGrid>

        <Box className={layoutClasses.operationDetailLayout}>
          <Box className={layoutClasses.operationalSection}>
            <Stack gap="lg">
              <OperationTeamSection
                operationId={operation.id}
                operationKind={operation.operationKind ?? "ONE_TIME"}
                canAssign={canAssign}
                operationWorkDate={operationWorkDate}
                operationalToday={operationalToday}
                workdayOptions={teamWorkdayOptions}
                selectedWorkday={teamWorkday}
                onWorkdayChange={setTeamWorkday}
                onFeedback={(message, severity) => showFeedback(message, severity)}
              />
              {operation.operationKind === "RECURRING" ? (
                <OperationScheduledWorkdaysSection
                  operationId={operation.id}
                  canManage={canManage}
                  highlightedWorkdayId={teamWorkday?.workdayId}
                  onSelectWorkdayForTeam={(workday) =>
                    setTeamWorkday({ workdayId: workday.id, workDate: workday.workDate })
                  }
                  onFeedback={(message, severity) => showFeedback(message, severity)}
                />
              ) : null}
            </Stack>
          </Box>

          <Box className={layoutClasses.dataSection}>
            <SectionCard
              title="Configuración"
              description="Parámetros de la operación y validación."
            >
              <OperationDetailFieldGrid
                fields={[
                  { label: "Tipo", value: operationKindLabels[operation.operationKind ?? "ONE_TIME"] },
                  { label: terminology.service.singular, value: serviceFieldValue },
                  { label: "Dirección", value: operation.service?.address ?? "—" },
                  ...(operation.operationKind === "RECURRING"
                    ? [
                        {
                          label: "Vigencia",
                          value: operation.schedule
                            ? formatRecurringValidity(
                                operation.schedule.validFrom,
                                operation.schedule.validUntil,
                              )
                            : "—",
                        },
                      ]
                    : [
                        { label: operationScheduleLabel, value: formatDateTime(operation.scheduledStart) },
                        { label: "Fin", value: formatDateTime(operation.scheduledEnd) },
                      ]),
                  {
                    label: "Geocerca",
                    value: operation.service?.allowedRadiusMeters
                      ? `${operation.service.allowedRadiusMeters} m`
                      : "—",
                  },
                  { label: "Tolerancia temprana", value: `${operation.earlyToleranceMinutes} min` },
                  { label: "Tolerancia tardía", value: `${operation.lateToleranceMinutes} min` },
                  { label: "Notas", value: operation.notes ?? "—" },
                ]}
              />
            </SectionCard>
          </Box>

          {editing && canEdit ? (
            <Box className={layoutClasses.editSection}>
              <SectionCard title={`Editar ${terminology.operation.singular.toLowerCase()}`}>
                <OperationForm
                  mode="edit"
                  currentStatus={operation.status}
                  currentOperationKind={operation.operationKind ?? "ONE_TIME"}
                  companyWorkSchedule={companyWorkScheduleQuery.data ?? null}
                  defaultValues={buildOperationEditDefaultValues(operation)}
                  submitLabel="Guardar cambios"
                  cancelTo={`/operations/${operation.id}`}
                  loading={updateMutation.isPending}
                  errorMessage={errorMessage}
                  onSubmit={handleUpdate}
                  embedded
                  formId={OPERATION_DETAIL_FORM_ID}
                  hideActions
                />
              </SectionCard>
            </Box>
          ) : null}
        </Box>
      </Stack>

      <ConfirmDialog
        open={confirmCancelOpen}
        title={`Cancelar ${terminology.operation.singular.toLowerCase()}`}
        description={`¿Confirmás cancelar esta ${terminology.operation.singular.toLowerCase()}? No podrá editarse luego.`}
        confirmLabel={`Cancelar ${terminology.operation.singular.toLowerCase()}`}
        destructive
        loading={cancelMutation.isPending}
        onCancel={() => setConfirmCancelOpen(false)}
        onConfirm={() => void handleCancel()}
      />
    </>
  );
}
