import { Alert, Button, Group } from "@mantine/core";
import { useState } from "react";
import { ReviewAttendanceDialog } from "../attendance/ReviewAttendanceDialog";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";
import { SectionCard } from "../../design-system";
import { useReviewAttendance } from "../../hooks/useAttendance";
import {
  useAssignInventoryEmployee,
  useInventoryAttendanceSummary,
  useUnassignInventoryEmployee,
} from "../../hooks/useInventories";
import { usePaginationState } from "../../hooks/usePaginationState";
import type { InventoryAttendanceSummaryEmployee } from "../../types/inventory-attendance-summary";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { InventoryOperationalEmployeeTable } from "./InventoryOperationalEmployeeTable";
import { OperationalSummaryMetrics } from "./OperationalSummaryMetrics";

interface InventoryOperationalSectionProps {
  inventoryId: string;
  canAssign: boolean;
  scheduledStart: string;
  assignedEmployeeIds: string[];
  onFeedback: (message: string, severity: "success" | "error") => void;
}

export const canReviewOperationalAttendance = (
  row: InventoryAttendanceSummaryEmployee,
): boolean => {
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
    <SectionCard
      title="Vista operativa"
      description={`Seguimiento de ${terminology.worker.plural.toLowerCase()} asignados y asistencias registradas.`}
      action={
        <Button
          variant="default"
          size="compact-sm"
          onClick={() => void summaryQuery.refetch()}
          loading={summaryQuery.isFetching}
        >
          Actualizar
        </Button>
      }
    >
      {summary ? <OperationalSummaryMetrics summary={summary} /> : null}

      {canAssign ? (
        <Group align="flex-end" gap="sm" mb="md" wrap="nowrap">
          <div style={{ flex: 1, minWidth: 0 }}>
            <EmployeeSearchAutocomplete
              label={`${terminology.worker.singular} activo`}
              value={selectedEmployeeId || null}
              onChange={(id) => setSelectedEmployeeId(id ?? "")}
              excludeIds={assignedEmployeeIds}
              descriptionMode="assignment"
              helperText="Buscá por nombre. Verás tipo y último día trabajado."
              placeholder="Nombre o teléfono"
            />
          </div>
          <Button
            onClick={() => void handleAssign()}
            disabled={!selectedEmployeeId || assignMutation.isPending}
            loading={assignMutation.isPending}
          >
            Asignar
          </Button>
        </Group>
      ) : (
        <Alert color="blue" mb="md">
          No se pueden asignar {terminology.worker.plural.toLowerCase()} a{" "}
          {terminology.operation.plural.toLowerCase()} completadas o canceladas.
        </Alert>
      )}

      <InventoryOperationalEmployeeTable
        inventoryId={inventoryId}
        rows={rows}
        scheduledStart={scheduledStart}
        loading={summaryQuery.isLoading}
        error={
          summaryQuery.isError
            ? getApiErrorMessage(summaryQuery.error, "No se pudo cargar la vista operativa.")
            : undefined
        }
        canAssign={canAssign}
        canReviewAttendance={canReviewOperationalAttendance}
        onReviewApprove={(attendanceId) =>
          setReviewTarget({ attendanceId, decision: "APPROVE" })
        }
        onReviewReject={(attendanceId) =>
          setReviewTarget({ attendanceId, decision: "REJECT" })
        }
        onUnassign={(employeeId) => void handleUnassign(employeeId)}
        unassignPending={unassignMutation.isPending}
        pagination={
          meta
            ? {
                meta,
                pageSize: pagination.pageSize,
                onPageChange: pagination.onPageChange,
                onPageSizeChange: pagination.onPageSizeChange,
              }
            : undefined
        }
        emptyTitle={`No hay ${terminology.worker.plural.toLowerCase()} asignados`}
        emptyDescription={`Asigná ${terminology.worker.plural.toLowerCase()} activos para comenzar el seguimiento operativo.`}
      />

      <ReviewAttendanceDialog
        open={Boolean(reviewTarget)}
        decision={reviewTarget?.decision ?? "APPROVE"}
        loading={reviewMutation.isPending}
        onClose={() => setReviewTarget(null)}
        onConfirm={handleReview}
      />
    </SectionCard>
  );
}
