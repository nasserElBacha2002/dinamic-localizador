import {
  Card,
  CardContent,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { Button, Group } from "@mantine/core";
import { useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../design-system";
import { DetailFieldGrid } from "../../components/common/DetailFieldGrid";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { InventoryForm } from "../../components/inventories/InventoryForm";
import { InventoryOperationalSection } from "../../components/inventories/InventoryOperationalSection";
import {
  useCancelInventory,
  useInventory,
  useUpdateInventory,
} from "../../hooks/useInventories";
import type { InventoryFormValues } from "../../schemas/inventory.schema";
import { datetimeLocalToIso, formatDateTime, isoToDatetimeLocal } from "../../utils/dates";
import { operationScheduleLabel, terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { isInventoryAssignable, isInventoryEditable } from "../../utils/inventory-status";
import { inventoryStatusLabels } from "../../utils/labels";

export function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const inventoryQuery = useInventory(id);
  const updateMutation = useUpdateInventory(id ?? "");
  const cancelMutation = useCancelInventory();

  const [editing, setEditing] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const inventory = inventoryQuery.data;

  const assignedEmployeeIds = useMemo(
    () => inventory?.assignedEmployees.map((employee) => employee.id) ?? [],
    [inventory?.assignedEmployees],
  );

  if (!id) {
    return (
      <ErrorState message={`${terminology.operation.singular} no encontrada.`} />
    );
  }

  if (inventoryQuery.isLoading) {
    return (
      <LoadingState />
    );
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

  const canAssign = isInventoryAssignable(inventory.status);
  const canEdit = isInventoryEditable(inventory.status);
  const storeDisplayName = inventory.store?.name ?? "—";
  const storeDetailId = inventory.storeId || inventory.store?.id;
  const storeFieldValue =
    storeDetailId && storeDisplayName !== "—" ? (
      <Link
        component={RouterLink}
        to={`/stores/${storeDetailId}`}
        title={`Ver ${terminology.location.singular.toLowerCase()}`}
        underline="hover"
        color="primary"
      >
        {storeDisplayName}
      </Link>
    ) : (
      storeDisplayName
    );

  const handleUpdate = async (values: InventoryFormValues) => {
    setErrorMessage(null);

    try {
      await updateMutation.mutateAsync({
        storeId: values.storeId,
        scheduledStart: datetimeLocalToIso(values.scheduledStart),
        scheduledEnd: values.scheduledEnd ? datetimeLocalToIso(values.scheduledEnd) : null,
        earlyToleranceMinutes: values.earlyToleranceMinutes,
        lateToleranceMinutes: values.lateToleranceMinutes,
        notes: values.notes?.trim() ? values.notes.trim() : null,
        status: values.status,
      });
      setEditing(false);
      setFeedback({
        open: true,
        message: `${terminology.operation.singular} actualizada correctamente.`,
        severity: "success",
      });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(id);
      setConfirmCancelOpen(false);
      setFeedback({
        open: true,
        message: `${terminology.operation.singular} cancelada.`,
        severity: "success",
      });
    } catch (error) {
      setFeedback({ open: true, message: getApiErrorMessage(error), severity: "error" });
    }
  };

  return (
    <>
      <PageHeader
        title={`Detalle de la ${terminology.operation.singular.toLowerCase()}`}
        description={`${inventory.store.name} · ${formatDateTime(inventory.scheduledStart)}`}
        action={
          <Group gap="xs">
            {canEdit ? (
              <Button variant="default" onClick={() => setEditing((current) => !current)}>
                {editing ? "Cancelar edición" : `Editar ${terminology.operation.singular.toLowerCase()}`}
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="default" color="danger" onClick={() => setConfirmCancelOpen(true)}>
                {`Cancelar ${terminology.operation.singular.toLowerCase()}`}
              </Button>
            ) : null}
            <Button component={RouterLink} to="/inventories" variant="default">
              Volver al listado
            </Button>
          </Group>
        }
      />

      <Stack spacing={3}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Datos generales
            </Typography>
            <DetailFieldGrid
              fields={[
                {
                  label: "Estado",
                  value: <StatusChip label={inventoryStatusLabels[inventory.status]} />,
                },
                { label: terminology.location.singular, value: storeFieldValue },
                { label: "Dirección", value: inventory.store?.address ?? "—" },
                { label: operationScheduleLabel, value: formatDateTime(inventory.scheduledStart) },
                { label: "Fin", value: formatDateTime(inventory.scheduledEnd) },
                { label: "Tolerancia temprana", value: `${inventory.earlyToleranceMinutes} min` },
                { label: "Tolerancia tardía", value: `${inventory.lateToleranceMinutes} min` },
                { label: "Asistencias registradas", value: inventory.attendanceRecordsCount },
                { label: "Notas", value: inventory.notes ?? "—" },
              ]}
            />
          </CardContent>
        </Card>

        {editing && canEdit ? (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {`Editar ${terminology.operation.singular.toLowerCase()}`}
              </Typography>
              <InventoryForm
                mode="edit"
                currentStatus={inventory.status}
                defaultValues={{
                  storeId: inventory.storeId,
                  scheduledStart: isoToDatetimeLocal(inventory.scheduledStart),
                  scheduledEnd: inventory.scheduledEnd ? isoToDatetimeLocal(inventory.scheduledEnd) : "",
                  earlyToleranceMinutes: inventory.earlyToleranceMinutes,
                  lateToleranceMinutes: inventory.lateToleranceMinutes,
                  notes: inventory.notes ?? "",
                  status: inventory.status,
                }}
                submitLabel="Guardar cambios"
                cancelTo={`/inventories/${inventory.id}`}
                loading={updateMutation.isPending}
                errorMessage={errorMessage}
                onSubmit={handleUpdate}
              />
            </CardContent>
          </Card>
        ) : null}

        <InventoryOperationalSection
          inventoryId={inventory.id}
          canAssign={canAssign}
          scheduledStart={inventory.scheduledStart}
          assignedEmployeeIds={assignedEmployeeIds}
          onFeedback={(message, severity) => setFeedback({ open: true, message, severity })}
        />
      </Stack>

      <ConfirmDialog
        open={confirmCancelOpen}
        title={`Cancelar ${terminology.operation.singular.toLowerCase()}`}
        description={`¿Confirmás cancelar esta ${terminology.operation.singular.toLowerCase()}? No podrá editarse luego.`}
        confirmLabel={`Cancelar ${terminology.operation.singular.toLowerCase()}`}
        destructive
        loading={cancelMutation.isPending}
        onCancel={() => setConfirmCancelOpen(false)}
        onConfirm={handleCancel}
      />

      <FeedbackSnackbar
        open={feedback.open}
        message={feedback.message}
        severity={feedback.severity}
        onClose={() => setFeedback((current) => ({ ...current, open: false }))}
      />
    </>
  );
}
