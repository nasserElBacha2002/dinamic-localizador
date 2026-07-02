import {
  Alert,
  Card,
  CardContent,
  Stack,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Button, Group } from "@mantine/core";
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
import type { InventoryAttendanceSummaryEmployee } from "../../types/inventory-attendance-summary";
import { formatDateTime } from "../../utils/dates";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import {
  locationStatusLabels,
  checkoutStatusLabels,
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
      onFeedback(`${terminology.worker.singular} asignado correctamente.`, "success");
    } catch (error) {
      onFeedback(getApiErrorMessage(error), "error");
    }
  };

  const handleUnassign = async (employeeId: string) => {
    try {
      await unassignMutation.mutateAsync(employeeId);
      onFeedback(`${terminology.worker.singular} desasignado correctamente.`, "success");
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
          <Button
            variant="default"
            size="compact-sm"
            onClick={() => summaryQuery.refetch()}
            loading={summaryQuery.isFetching}
          >
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
              label={`${terminology.worker.singular} activo`}
              value={selectedEmployeeId || null}
              onChange={(id) => setSelectedEmployeeId(id ?? "")}
              excludeIds={assignedEmployeeIds}
              descriptionMode="assignment"
              helperText="Buscá por nombre. Verás tipo y último día trabajado."
            />
            <Button
              onClick={handleAssign}
              disabled={!selectedEmployeeId || assignMutation.isPending}
              loading={assignMutation.isPending}
              style={{ alignSelf: "center", minWidth: 120 }}
            >
              Asignar
            </Button>
          </Stack>
        ) : (
          <Alert severity="info" sx={{ mb: 2 }}>
            No se pueden asignar {terminology.worker.plural.toLowerCase()} a{" "}
            {terminology.operation.plural.toLowerCase()} completadas o canceladas.
          </Alert>
        )}

        <DataTable
          isLoading={summaryQuery.isLoading}
          isError={summaryQuery.isError}
          errorMessage={getApiErrorMessage(summaryQuery.error, "No se pudo cargar la vista operativa.")}
          isEmpty={!summaryQuery.isLoading && rows.length === 0}
          emptyTitle={`No hay ${terminology.worker.plural.toLowerCase()} asignados`}
          emptyDescription={`Asigná ${terminology.worker.plural.toLowerCase()} activos para comenzar el seguimiento operativo.`}
          meta={meta}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
          showPageSizeSelector
          head={
            <TableHead>
              <TableRow>
                <TableCell>{terminology.worker.singular}</TableCell>
                <TableCell>Teléfono</TableCell>
                <TableCell>Hora esperada</TableCell>
                <TableCell>Check-in</TableCell>
                <TableCell>Distancia</TableCell>
                <TableCell>Check-out</TableCell>
                <TableCell>Estado salida</TableCell>
                <TableCell>Tiempo extra</TableCell>
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
                {row.attendance?.checkoutAt ? formatDateTime(row.attendance.checkoutAt) : "—"}
              </TableCell>
              <TableCell>
                {row.attendance?.checkoutStatus ? (
                  <StatusChip label={checkoutStatusLabels[row.attendance.checkoutStatus]} />
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                {row.attendance?.extraWorkedMinutes
                  ? `${row.attendance.extraWorkedMinutes} min`
                  : row.attendance?.earlyDepartureMinutes
                    ? `${row.attendance.earlyDepartureMinutes} min antes`
                    : "—"}
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
                <Group gap="xs" justify="flex-end" wrap="wrap">
                  {row.attendance ? (
                    <Button
                      component={RouterLink}
                      to={`/attendance/${row.attendance.id}`}
                      size="compact-sm"
                      variant="light"
                    >
                      Ver
                    </Button>
                  ) : null}
                  {canReviewAttendance(row) ? (
                    <>
                      <Button
                        size="compact-sm"
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
                        size="compact-sm"
                        color="danger"
                        variant="default"
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
                      size="compact-sm"
                      color="danger"
                      variant="light"
                      disabled={unassignMutation.isPending}
                      loading={unassignMutation.isPending}
                      onClick={() => handleUnassign(row.employee.id)}
                    >
                      Desasignar
                    </Button>
                  ) : null}
                </Group>
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
