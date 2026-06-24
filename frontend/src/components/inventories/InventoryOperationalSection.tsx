import {
  Alert,
  Button,
  Card,
  CardContent,
  Stack,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ReviewAttendanceDialog } from "../attendance/ReviewAttendanceDialog";
import { DataTable } from "../common/DataTable";
import { StatusChip } from "../common/StatusChip";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";
import { useReviewAttendance } from "../../hooks/useAttendance";
import {
  useAssignInventoryEmployee,
  useInventoryAttendanceSummary,
  useUnassignInventoryEmployee,
} from "../../hooks/useInventories";
import { usePaginationState } from "../../hooks/usePaginationState";
import type { InventoryAttendanceSummaryEmployee } from "../../types/inventory";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  locationStatusLabels,
  operationalStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";

interface InventoryOperationalSectionProps {
  inventoryId: string;
  canAssign: boolean;
  scheduledStart: string;
  assignedEmployeeIds: string[];
  onFeedback: (message: string, severity: "success" | "error") => void;
}

const canReviewAttendance = (row: InventoryAttendanceSummaryEmployee): boolean => {
  if (!row.attendance || row.attendance.reviewedAt) {
    return false;
  }

  return (
    row.attendance.validationStatus === "PENDING_REVIEW" ||
    row.attendance.validationStatus === "REJECTED"
  );
};

export function InventoryOperationalSection({
  inventoryId,
  canAssign,
  scheduledStart,
  assignedEmployeeIds,
  onFeedback,
}: InventoryOperationalSectionProps) {
  const pagination = usePaginationState(10);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [reviewTarget, setReviewTarget] = useState<{
    attendanceId: string;
    decision: "APPROVE" | "REJECT";
  } | null>(null);

  const summaryQuery = useInventoryAttendanceSummary(inventoryId, {
    page: pagination.page,
    limit: pagination.pageSize,
  });
  const assignMutation = useAssignInventoryEmployee(inventoryId);
  const unassignMutation = useUnassignInventoryEmployee(inventoryId);
  const reviewMutation = useReviewAttendance();

  const handleAssign = async () => {
    if (!selectedEmployeeId) {
      return;
    }

    try {
      await assignMutation.mutateAsync(selectedEmployeeId);
      setSelectedEmployeeId("");
      pagination.resetPage();
      onFeedback("Empleado asignado correctamente.", "success");
    } catch (error) {
      onFeedback(getApiErrorMessage(error), "error");
    }
  };

  const handleUnassign = async (employeeId: string) => {
    try {
      await unassignMutation.mutateAsync(employeeId);
      onFeedback("Empleado desasignado correctamente.", "success");
    } catch (error) {
      onFeedback(getApiErrorMessage(error), "error");
    }
  };

  const handleReview = async (input: { decision: "APPROVE" | "REJECT"; reason: string }) => {
    if (!reviewTarget) {
      return;
    }

    try {
      await reviewMutation.mutateAsync({
        attendanceId: reviewTarget.attendanceId,
        input,
      });
      setReviewTarget(null);
      onFeedback("Revisión registrada correctamente.", "success");
    } catch (error) {
      onFeedback(getApiErrorMessage(error), "error");
    }
  };

  const summary = summaryQuery.data?.summary;
  const rows = summaryQuery.data?.employees ?? [];
  const meta = summaryQuery.data?.meta;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">Vista operativa</Typography>
          <Button onClick={() => summaryQuery.refetch()} disabled={summaryQuery.isFetching}>
            Actualizar
          </Button>
        </Stack>

        {summary ? (
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Typography>Asignados: {summary.assigned}</Typography>
            <Typography>Con check-in: {summary.checkedIn}</Typography>
            <Typography>Validados: {summary.valid}</Typography>
            <Typography>Pendientes: {summary.pendingReview}</Typography>
            <Typography>Rechazados: {summary.rejected}</Typography>
            <Typography>Sin registro: {summary.withoutCheckIn}</Typography>
          </Stack>
        ) : null}

        {canAssign ? (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
            <EmployeeSearchAutocomplete
              label="Empleado activo"
              value={selectedEmployeeId || null}
              onChange={(id) => setSelectedEmployeeId(id ?? "")}
              excludeIds={assignedEmployeeIds}
              descriptionMode="assignment"
              helperText="Buscá por nombre. Verás tipo y último día trabajado."
            />
            <Button
              variant="contained"
              onClick={handleAssign}
              disabled={!selectedEmployeeId || assignMutation.isPending}
              sx={{ alignSelf: { sm: "center" }, minWidth: 120 }}
            >
              Asignar
            </Button>
          </Stack>
        ) : (
          <Alert severity="info" sx={{ mb: 2 }}>
            No se pueden asignar empleados a inventarios completados o cancelados.
          </Alert>
        )}

        <DataTable
          isLoading={summaryQuery.isLoading}
          isError={summaryQuery.isError}
          errorMessage={getApiErrorMessage(summaryQuery.error, "No se pudo cargar la vista operativa.")}
          isEmpty={!summaryQuery.isLoading && rows.length === 0}
          emptyTitle="No hay empleados asignados"
          emptyDescription="Asigná empleados activos para comenzar el seguimiento operativo."
          meta={meta}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
          showPageSizeSelector
          head={
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
          }
        >
          {rows.map((row) => (
            <TableRow key={row.employee.id}>
              <TableCell>{row.employee.name}</TableCell>
              <TableCell>{row.employee.phoneNumber}</TableCell>
              <TableCell>{formatDateTime(scheduledStart)}</TableCell>
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
                <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                  {row.attendance ? (
                    <Button
                      component={RouterLink}
                      to={`/attendance/${row.attendance.id}`}
                      size="small"
                    >
                      Ver
                    </Button>
                  ) : null}
                  {canReviewAttendance(row) ? (
                    <>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() =>
                          setReviewTarget({
                            attendanceId: row.attendance!.id,
                            decision: "APPROVE",
                          })
                        }
                      >
                        Aprobar
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() =>
                          setReviewTarget({
                            attendanceId: row.attendance!.id,
                            decision: "REJECT",
                          })
                        }
                      >
                        Rechazar
                      </Button>
                    </>
                  ) : null}
                  {canAssign && !row.attendance ? (
                    <Button
                      size="small"
                      color="error"
                      disabled={unassignMutation.isPending}
                      onClick={() => handleUnassign(row.employee.id)}
                    >
                      Desasignar
                    </Button>
                  ) : null}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </CardContent>

      <ReviewAttendanceDialog
        open={Boolean(reviewTarget)}
        decision={reviewTarget?.decision ?? "APPROVE"}
        loading={reviewMutation.isPending}
        onClose={() => setReviewTarget(null)}
        onConfirm={handleReview}
      />
    </Card>
  );
}
