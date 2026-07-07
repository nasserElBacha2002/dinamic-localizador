import { Button } from "@mantine/core";
import { useState } from "react";
import { ReviewAttendanceDialog } from "../attendance/ReviewAttendanceDialog";
import { SectionCard } from "../../design-system";
import { useReviewAttendance } from "../../hooks/useAttendance";
import { useOperationAttendanceSummary, useCancelOperationAssignment } from "../../hooks/useOperations";
import { usePaginationState } from "../../hooks/usePaginationState";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { OperationEmployeeTable } from "./OperationEmployeeTable";
import { canReviewOperationalAttendance } from "./operation-workforce-attendance";
import { OperationalSummaryMetrics } from "./OperationalSummaryMetrics";

interface OperationWorkforceSectionProps {
  operationId: string;
  canAssign: boolean;
  scheduledStart: string | null;
  onFeedback: (message: string, severity: "success" | "error") => void;
}

export function OperationWorkforceSection({
  operationId,
  canAssign,
  scheduledStart,
  onFeedback,
}: OperationWorkforceSectionProps) {
  const pagination = usePaginationState(10);
  const [reviewTarget, setReviewTarget] = useState<{
    attendanceId: string;
    decision: "APPROVE" | "REJECT";
  } | null>(null);

  const summaryQuery = useOperationAttendanceSummary(operationId, {
    page: pagination.page,
    limit: pagination.pageSize,
  });
  const cancelMutation = useCancelOperationAssignment(operationId);
  const reviewMutation = useReviewAttendance();

  const handleCancel = async (assignmentId: string) => {
    try {
      await cancelMutation.mutateAsync(assignmentId);
      onFeedback("Asignación cancelada correctamente.", "success");
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

      <OperationEmployeeTable
        operationId={operationId}
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
        onUnassign={(assignmentId) => void handleCancel(assignmentId)}
        unassignPending={cancelMutation.isPending}
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
