import { Anchor, Box, Button, Group, SimpleGrid, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
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
import { OperationDetailFieldGrid } from "../../components/operations/OperationDetailFieldGrid";
import { OperationForm, OPERATION_DETAIL_FORM_ID } from "../../components/operations/OperationForm";
import { OperationWorkforceSection } from "../../components/operations/OperationWorkforceSection";
import layoutClasses from "../../components/operations/operation-detail-layout.module.css";
import {
  useCancelOperation,
  useOperation,
  useUpdateOperation,
} from "../../hooks/useOperations";
import type { OperationFormValues } from "../../schemas/operation.schema";
import type { OperationStatus } from "../../types/operation";
import { datetimeLocalToIso, formatDateTime, isoToDatetimeLocal } from "../../utils/dates";
import { operationScheduleLabel, terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { isOperationAssignable, isOperationEditable } from "../../utils/operation-status";
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
      await updateMutation.mutateAsync({
        serviceId: values.serviceId,
        scheduledStart: datetimeLocalToIso(values.scheduledStart),
        scheduledEnd: values.scheduledEnd ? datetimeLocalToIso(values.scheduledEnd) : null,
        earlyToleranceMinutes: values.earlyToleranceMinutes,
        lateToleranceMinutes: values.lateToleranceMinutes,
        notes: values.notes?.trim() ? values.notes.trim() : null,
        status: values.status,
      });
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
        description={`${operation.service.name} · ${formatDateTime(operation.scheduledStart)}`}
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
            value={formatDateTime(operation.scheduledStart)}
            description={
              operation.scheduledEnd
                ? `Fin: ${formatDateTime(operation.scheduledEnd)}`
                : "Sin horario de fin"
            }
          />
          <MetricCard title="Geocerca" value={geofenceSummary} description="Radio y tolerancias horarias" />
        </SimpleGrid>

        <Box className={layoutClasses.operationDetailLayout}>
          <Box className={layoutClasses.operationalSection}>
            <OperationWorkforceSection
              operationId={operation.id}
              canAssign={canAssign}
              scheduledStart={operation.scheduledStart}
              assignedEmployeeIds={assignedEmployeeIds}
              onFeedback={(message, severity) => showFeedback(message, severity)}
            />
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
                  { label: terminology.service.singular, value: serviceFieldValue },
                  { label: "Dirección", value: operation.service?.address ?? "—" },
                  { label: operationScheduleLabel, value: formatDateTime(operation.scheduledStart) },
                  { label: "Fin", value: formatDateTime(operation.scheduledEnd) },
                  { label: "Tolerancia temprana", value: `${operation.earlyToleranceMinutes} min` },
                  { label: "Tolerancia tardía", value: `${operation.lateToleranceMinutes} min` },
                  { label: "Asistencias registradas", value: operation.attendanceRecordsCount },
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
                  defaultValues={{
                    serviceId: operation.serviceId,
                    scheduledStart: isoToDatetimeLocal(operation.scheduledStart),
                    scheduledEnd: operation.scheduledEnd ? isoToDatetimeLocal(operation.scheduledEnd) : "",
                    earlyToleranceMinutes: operation.earlyToleranceMinutes,
                    lateToleranceMinutes: operation.lateToleranceMinutes,
                    notes: operation.notes ?? "",
                    status: operation.status,
                  }}
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
