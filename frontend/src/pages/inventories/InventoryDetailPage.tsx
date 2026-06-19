import {
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
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
import { useStores } from "../../hooks/useStores";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { InventoryFormValues } from "../../schemas/inventory.schema";
import { datetimeLocalToIso, formatDateTime, isoToDatetimeLocal } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { isInventoryAssignable, isInventoryEditable } from "../../utils/inventory-status";
import { inventoryStatusLabels } from "../../utils/labels";

export function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const inventoryQuery = useInventory(id);
  const storesQuery = useStores({ page: 1, limit: 100 });
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
      <AdminLayout>
        <ErrorState message="Inventario no encontrado." />
      </AdminLayout>
    );
  }

  if (inventoryQuery.isLoading || storesQuery.isLoading) {
    return (
      <AdminLayout>
        <LoadingState />
      </AdminLayout>
    );
  }

  if (inventoryQuery.isError || !inventory) {
    return (
      <AdminLayout>
        <ErrorState message={getApiErrorMessage(inventoryQuery.error, "Inventario no encontrado.")} />
      </AdminLayout>
    );
  }

  const canAssign = isInventoryAssignable(inventory.status);
  const canEdit = isInventoryEditable(inventory.status);

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
      setFeedback({ open: true, message: "Inventario actualizado correctamente.", severity: "success" });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(id);
      setConfirmCancelOpen(false);
      setFeedback({ open: true, message: "Inventario cancelado.", severity: "success" });
    } catch (error) {
      setFeedback({ open: true, message: getApiErrorMessage(error), severity: "error" });
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Detalle de inventario"
        description={`${inventory.store.name} · ${formatDateTime(inventory.scheduledStart)}`}
        action={
          <Stack direction="row" spacing={1}>
            {canEdit ? (
              <Button variant="outlined" onClick={() => setEditing((current) => !current)}>
                {editing ? "Cancelar edición" : "Editar inventario"}
              </Button>
            ) : null}
            {canEdit ? (
              <Button color="error" variant="outlined" onClick={() => setConfirmCancelOpen(true)}>
                Cancelar inventario
              </Button>
            ) : null}
            <Button component={RouterLink} to="/inventories">
              Volver al listado
            </Button>
          </Stack>
        }
      />

      <Stack spacing={3}>
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="h6">Datos generales</Typography>
              <Typography>Estado: <StatusChip label={inventoryStatusLabels[inventory.status]} /></Typography>
              <Typography>Tienda: {inventory.store.name}</Typography>
              <Typography>Inicio: {formatDateTime(inventory.scheduledStart)}</Typography>
              <Typography>Fin: {formatDateTime(inventory.scheduledEnd)}</Typography>
              <Typography>Tolerancia temprana: {inventory.earlyToleranceMinutes} min</Typography>
              <Typography>Tolerancia tardía: {inventory.lateToleranceMinutes} min</Typography>
              <Typography>Asistencias registradas: {inventory.attendanceRecordsCount}</Typography>
              <Typography>Notas: {inventory.notes ?? "—"}</Typography>
            </Stack>
          </CardContent>
        </Card>

        {editing && canEdit ? (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Editar inventario
              </Typography>
              <InventoryForm
                mode="edit"
                stores={storesQuery.data?.data ?? []}
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
        title="Cancelar inventario"
        description="¿Confirmás cancelar este inventario? No podrá editarse luego."
        confirmLabel="Cancelar inventario"
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
    </AdminLayout>
  );
}
