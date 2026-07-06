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
import { OperationForm, INVENTORY_DETAIL_FORM_ID } from "../../components/operations/OperationForm";
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

function inventoryStatusTone(status: OperationStatus): StatusBadgeTone {
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
  const inventoryQuery = useOperation(id);
  const updateMutation = useUpdateOperation(id ?? "");
  const cancelMutation = useCancelOperation();

  const [editing, setEditing] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showFeedback = (message: string, severity: "success" | "error" = "success") => {
    notifications.show({ color: severity === "error" ? "red" : "green", message });
  };

  const inventory = inventoryQuery.data;

  const assignedEmployeeIds = useMemo(
    () => inventory?.assignedEmployees.map((employee) => employee.id) ?? [],
    [inventory?.assignedEmployees],
  );

  if (!id) {
    return <ErrorState message={`${terminology.operation.singular} no encontrada.`} />;
  }

  if (inventoryQuery.isLoading) {
    return <LoadingState />;
  }

  if (inventoryQuery.isError || !inventory) {
    return (
      <ErrorState
        message={getApiErrorMessage(
          inventoryQuery.error,
          `${terminology.operation.singular} no encontrada.`,
        )}
      />
    );
  }

  const canAssign = isOperationAssignable(inventory.status);
  const canEdit = isOperationEditable(inventory.status);
  const storeDisplayName = inventory.service?.name ?? "—";
  const storeDetailId = inventory.serviceId || inventory.service?.id;
  const storeFieldValue =
    storeDetailId && storeDisplayName !== "—" ? (
      <Anchor component={RouterLink} to={`/services/${storeDetailId}`} size="sm">
        {storeDisplayName}
      </Anchor>
    ) : (
      storeDisplayName
    );

  const geofenceSummary = inventory.service?.allowedRadiusMeters
    ? `${inventory.service.allowedRadiusMeters} m · tolerancias ${inventory.earlyToleranceMinutes}/${inventory.lateToleranceMinutes} min`
    : `Tolerancias ${inventory.earlyToleranceMinutes}/${inventory.lateToleranceMinutes} min`;

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
        description={`${inventory.service.name} · ${formatDateTime(inventory.scheduledStart)}`}
        action={
          <Group gap="sm" wrap="wrap">
            {editing && canEdit ? (
              <Button
                type="submit"
                form={INVENTORY_DETAIL_FORM_ID}
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
                label={operationStatusLabels[inventory.status]}
                tone={inventoryStatusTone(inventory.status)}
              />
            }
          />
          <MetricCard
            title="Asistencias registradas"
            value={inventory.attendanceRecordsCount}
            description="Registros vinculados a esta operación"
          />
          <MetricCard
            title="Horario de operación"
            value={formatDateTime(inventory.scheduledStart)}
            description={
              inventory.scheduledEnd
                ? `Fin: ${formatDateTime(inventory.scheduledEnd)}`
                : "Sin horario de fin"
            }
          />
          <MetricCard title="Geocerca" value={geofenceSummary} description="Radio y tolerancias horarias" />
        </SimpleGrid>

        <Box className={layoutClasses.inventoryDetailLayout}>
          <Box className={layoutClasses.operationalSection}>
            <OperationWorkforceSection
              operationId={inventory.id}
              canAssign={canAssign}
              scheduledStart={inventory.scheduledStart}
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
                        label={operationStatusLabels[inventory.status]}
                        tone={inventoryStatusTone(inventory.status)}
                      />
                    ),
                  },
                  { label: terminology.service.singular, value: storeFieldValue },
                  { label: "Dirección", value: inventory.service?.address ?? "—" },
                  { label: operationScheduleLabel, value: formatDateTime(inventory.scheduledStart) },
                  { label: "Fin", value: formatDateTime(inventory.scheduledEnd) },
                  { label: "Tolerancia temprana", value: `${inventory.earlyToleranceMinutes} min` },
                  { label: "Tolerancia tardía", value: `${inventory.lateToleranceMinutes} min` },
                  { label: "Asistencias registradas", value: inventory.attendanceRecordsCount },
                  { label: "Notas", value: inventory.notes ?? "—" },
                ]}
              />
            </SectionCard>
          </Box>

          {editing && canEdit ? (
            <Box className={layoutClasses.editSection}>
              <SectionCard title={`Editar ${terminology.operation.singular.toLowerCase()}`}>
                <OperationForm
                  mode="edit"
                  currentStatus={inventory.status}
                  defaultValues={{
                    serviceId: inventory.serviceId,
                    scheduledStart: isoToDatetimeLocal(inventory.scheduledStart),
                    scheduledEnd: inventory.scheduledEnd ? isoToDatetimeLocal(inventory.scheduledEnd) : "",
                    earlyToleranceMinutes: inventory.earlyToleranceMinutes,
                    lateToleranceMinutes: inventory.lateToleranceMinutes,
                    notes: inventory.notes ?? "",
                    status: inventory.status,
                  }}
                  submitLabel="Guardar cambios"
                  cancelTo={`/operations/${inventory.id}`}
                  loading={updateMutation.isPending}
                  errorMessage={errorMessage}
                  onSubmit={handleUpdate}
                  embedded
                  formId={INVENTORY_DETAIL_FORM_ID}
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
