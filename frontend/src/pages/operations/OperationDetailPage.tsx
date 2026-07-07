import { Anchor, Box, Button, Divider, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { WeeklySchedulePreview } from "../../components/schedules/WeeklySchedulePreview";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCompanyWorkSchedule } from "../../hooks/useCompanyWorkSchedule";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
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
import { OperationAssignmentsSection } from "../../components/operations/OperationAssignmentsSection";
import { OperationDetailFieldGrid } from "../../components/operations/OperationDetailFieldGrid";
import { OperationForm, OPERATION_DETAIL_FORM_ID } from "../../components/operations/OperationForm";
import { OperationScheduledWorkdaysSection } from "../../components/operations/OperationScheduledWorkdaysSection";
import { OperationWorkforceSection } from "../../components/operations/OperationWorkforceSection";
import layoutClasses from "../../components/operations/operation-detail-layout.module.css";
import {
  useCancelOperation,
  useOperation,
  useUpdateOperation,
} from "../../hooks/useOperations";
import type { OperationFormValues } from "../../schemas/operation.schema";
import type { OperationStatus } from "../../types/operation";
import { formatDateTime } from "../../utils/dates";
import { operationScheduleLabel, terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
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
  scheduleSourceLabels,
} from "../../utils/operation-schedule-display";
import { operationStatusLabels } from "../../utils/labels";

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
  const permissionsQuery = useCompanyPermissions();
  const updateMutation = useUpdateOperation(id ?? "");
  const cancelMutation = useCancelOperation();

  const [editing, setEditing] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showFeedback = (message: string, severity: "success" | "error" = "success") => {
    notifications.show({ color: severity === "error" ? "red" : "green", message });
  };

  const operation = operationQuery.data;

  const assignedEmployeeIds = useMemo(
    () => operation?.assignedEmployees.map((employee) => employee.id) ?? [],
    [operation?.assignedEmployees],
  );

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

  const canAssign = isOperationAssignable(operation.status);
  const canManage = hasPermission(permissionsQuery.data?.permissions, "operations:manage");
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
          />
          <MetricCard
            title="Asistencias registradas"
            value={operation.attendanceRecordsCount}
            description="Registros vinculados a esta operación"
          />
          <MetricCard
            title="Horario de operación"
            value={
              operation.operationKind === "RECURRING"
                ? operationKindLabels.RECURRING
                : formatDateTime(operation.scheduledStart)
            }
            description={
              operation.operationKind === "RECURRING"
                ? operation.schedule
                  ? formatRecurringValidity(operation.schedule.validFrom, operation.schedule.validUntil)
                  : "Trabajo habitual"
                : operation.scheduledEnd
                  ? `Fin: ${formatDateTime(operation.scheduledEnd)}`
                  : "Sin horario de fin"
            }
          />
          <MetricCard title="Geocerca" value={geofenceSummary} description="Radio y tolerancias horarias" />
        </SimpleGrid>

        <Box className={layoutClasses.operationDetailLayout}>
          <Box className={layoutClasses.operationalSection}>
            <Stack gap="lg">
              <OperationAssignmentsSection
                operationId={operation.id}
                operationKind={operation.operationKind ?? "ONE_TIME"}
                canAssign={canAssign}
                operationWorkDate={operationWorkDate}
                activeEmployeeIds={assignedEmployeeIds}
                onFeedback={(message, severity) => showFeedback(message, severity)}
              />
              {operation.operationKind === "RECURRING" ? (
                <OperationScheduledWorkdaysSection
                  operationId={operation.id}
                  canManage={canManage}
                  onFeedback={(message, severity) => showFeedback(message, severity)}
                />
              ) : null}
              <OperationWorkforceSection
                operationId={operation.id}
                canAssign={canAssign}
                scheduledStart={operation.scheduledStart}
                onFeedback={(message, severity) => showFeedback(message, severity)}
              />
            </Stack>
          </Box>

          <Box className={layoutClasses.dataSection}>
            <SectionCard
              title="Datos de operación"
              description="Información general, ubicación y parámetros de validación."
            >
              <OperationDetailFieldGrid
                fields={[
                  {
                    label: "Estado",
                    value: (
                      <StatusBadge
                        label={operationStatusLabels[operation.status]}
                        tone={operationStatusTone(operation.status)}
                      />
                    ),
                  },
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
                  { label: "Tolerancia temprana", value: `${operation.earlyToleranceMinutes} min` },
                  { label: "Tolerancia tardía", value: `${operation.lateToleranceMinutes} min` },
                  { label: "Asistencias registradas", value: operation.attendanceRecordsCount },
                  { label: "Notas", value: operation.notes ?? "—" },
                ]}
              />

              {operation.operationKind === "RECURRING" && operation.schedule ? (
                <>
                  <Divider my="sm" />
                  <Stack gap="sm">
                    <Stack gap={2}>
                      <Text size="sm" fw={600}>
                        Horario de trabajo
                      </Text>
                      <Text size="xs" c="dimmed">
                        Configuración semanal de la operación habitual.
                      </Text>
                    </Stack>
                    <Group gap="xs">
                      <StatusBadge
                        label={scheduleSourceLabels[operation.schedule.scheduleSource]}
                        tone="info"
                        variant="light"
                      />
                    </Group>
                    <WeeklySchedulePreview days={operation.schedule.days} />
                  </Stack>
                </>
              ) : null}
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
