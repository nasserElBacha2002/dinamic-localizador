import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
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
import {
  useAssignInventoryEmployee,
  useCancelInventory,
  useInventory,
  useInventoryAttendanceSummary,
  useUnassignInventoryEmployee,
  useUpdateInventory,
} from "../../hooks/useInventories";
import { useEmployees } from "../../hooks/useEmployees";
import { useStores } from "../../hooks/useStores";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { InventoryFormValues } from "../../schemas/inventory.schema";
import { datetimeLocalToIso, formatDateTime, isoToDatetimeLocal } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { isInventoryAssignable, isInventoryEditable } from "../../utils/inventory-status";
import { inventoryStatusLabels, locationStatusLabels, operationalStatusLabels, punctualityStatusLabels, validationStatusLabels } from "../../utils/labels";

export function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const inventoryQuery = useInventory(id);
  const summaryQuery = useInventoryAttendanceSummary(id);
  const storesQuery = useStores({ page: 1, limit: 100 });
  const employeesQuery = useEmployees({ page: 1, limit: 100, active: true });
  const updateMutation = useUpdateInventory(id ?? "");
  const assignMutation = useAssignInventoryEmployee(id ?? "");
  const unassignMutation = useUnassignInventoryEmployee(id ?? "");
  const cancelMutation = useCancelInventory();

  const [editing, setEditing] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const inventory = inventoryQuery.data;

  const availableEmployees = useMemo(() => {
    if (!inventory || !employeesQuery.data) {
      return [];
    }

    const assignedIds = new Set(inventory.assignedEmployees.map((employee) => employee.id));
    return employeesQuery.data.data.filter((employee) => !assignedIds.has(employee.id));
  }, [employeesQuery.data, inventory]);

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

  const handleAssign = async () => {
    if (!selectedEmployeeId) {
      return;
    }

    try {
      await assignMutation.mutateAsync(selectedEmployeeId);
      setSelectedEmployeeId("");
      setFeedback({ open: true, message: "Empleado asignado correctamente.", severity: "success" });
    } catch (error) {
      setFeedback({ open: true, message: getApiErrorMessage(error), severity: "error" });
    }
  };

  const handleUnassign = async (employeeId: string) => {
    try {
      await unassignMutation.mutateAsync(employeeId);
      setFeedback({ open: true, message: "Empleado desasignado correctamente.", severity: "success" });
    } catch (error) {
      setFeedback({ open: true, message: getApiErrorMessage(error), severity: "error" });
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

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Empleados asignados
            </Typography>

            {canAssign ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
                <FormControl fullWidth>
                  <InputLabel id="assign-employee-label">Empleado activo</InputLabel>
                  <Select
                    labelId="assign-employee-label"
                    label="Empleado activo"
                    value={selectedEmployeeId}
                    onChange={(event) => setSelectedEmployeeId(event.target.value)}
                  >
                    {availableEmployees.map((employee) => (
                      <MenuItem key={employee.id} value={employee.id}>
                        {employee.name} ({employee.phoneNumber})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  onClick={handleAssign}
                  disabled={!selectedEmployeeId || assignMutation.isPending}
                >
                  Asignar
                </Button>
              </Stack>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>
                No se pueden asignar empleados a inventarios completados o cancelados.
              </Alert>
            )}

            {inventory.assignedEmployees.length === 0 ? (
              <Typography color="text.secondary">No hay empleados asignados.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nombre</TableCell>
                    <TableCell>Teléfono</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {inventory.assignedEmployees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>{employee.name}</TableCell>
                      <TableCell>{employee.phoneNumber}</TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          color="error"
                          disabled={!canAssign || unassignMutation.isPending}
                          onClick={() => handleUnassign(employee.id)}
                        >
                          Desasignar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" sx={{ mb: 2 }}>
              <Typography variant="h6">Vista operativa</Typography>
              <Button onClick={() => summaryQuery.refetch()} disabled={summaryQuery.isFetching}>
                Actualizar
              </Button>
            </Stack>

            {summaryQuery.isLoading ? <LoadingState /> : null}
            {summaryQuery.isError ? (
              <ErrorState message={getApiErrorMessage(summaryQuery.error, "No se pudo cargar el resumen.")} />
            ) : null}

            {summaryQuery.data ? (
              <Stack spacing={2}>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <Typography>Asignados: {summaryQuery.data.summary.assigned}</Typography>
                  <Typography>Con check-in: {summaryQuery.data.summary.checkedIn}</Typography>
                  <Typography>Validados: {summaryQuery.data.summary.valid}</Typography>
                  <Typography>Pendientes: {summaryQuery.data.summary.pendingReview}</Typography>
                  <Typography>Rechazados: {summaryQuery.data.summary.rejected}</Typography>
                  <Typography>Sin registro: {summaryQuery.data.summary.withoutCheckIn}</Typography>
                </Stack>

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Empleado</TableCell>
                      <TableCell>Teléfono</TableCell>
                      <TableCell>Hora esperada</TableCell>
                      <TableCell>Check-in</TableCell>
                      <TableCell>Distancia</TableCell>
                      <TableCell>Ubicación</TableCell>
                      <TableCell>Puntualidad</TableCell>
                      <TableCell>Validación</TableCell>
                      <TableCell>Estado operativo</TableCell>
                      <TableCell align="right">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summaryQuery.data.employees.map((row) => (
                      <TableRow key={row.employee.id}>
                        <TableCell>{row.employee.name}</TableCell>
                        <TableCell>{row.employee.phoneNumber}</TableCell>
                        <TableCell>{formatDateTime(summaryQuery.data.inventory.scheduledStart)}</TableCell>
                        <TableCell>
                          {row.attendance ? formatDateTime(row.attendance.receivedAt) : "—"}
                        </TableCell>
                        <TableCell>
                          {row.attendance ? `${row.attendance.distanceMeters.toFixed(1)} m` : "—"}
                        </TableCell>
                        <TableCell>
                          {row.attendance ? (
                            <StatusChip label={locationStatusLabels[row.attendance.locationStatus]} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {row.attendance ? (
                            <StatusChip label={punctualityStatusLabels[row.attendance.punctualityStatus]} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {row.attendance ? (
                            <StatusChip label={validationStatusLabels[row.attendance.validationStatus]} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusChip label={operationalStatusLabels[row.operationalStatus]} />
                        </TableCell>
                        <TableCell align="right">
                          {row.attendance ? (
                            <Button component={RouterLink} to={`/attendance/${row.attendance.id}`} size="small">
                              Ver asistencia
                            </Button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Stack>
            ) : null}
          </CardContent>
        </Card>
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
