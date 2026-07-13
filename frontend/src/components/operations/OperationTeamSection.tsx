import { Button, Collapse, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { ReviewAttendanceDialog } from "../attendance/ReviewAttendanceDialog";
import { SectionCard } from "../../design-system";
import { useReviewAttendance } from "../../hooks/useAttendance";
import {
  useAssignOperationEmployee,
  useCancelOperationAssignment,
  useEndOperationAssignment,
  useOperationAttendanceSummary,
  useOperationEmployees,
} from "../../hooks/useOperations";
import { usePaginationState } from "../../hooks/usePaginationState";
import type { OperationEmployeeAssignment, OperationKind } from "../../types/operation";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage, parseApiError } from "../../utils/errors";
import { EndAssignmentDialog } from "./EndAssignmentDialog";
import { OperationAssignmentList } from "./OperationAssignmentList";
import { OperationEmployeeTable } from "./OperationEmployeeTable";
import { OperationTeamManageDialog } from "./OperationTeamManageDialog";
import {
  isCurrentOperationalAssignment,
  mapAssignmentErrorMessage,
} from "./operation-assignment-display";
import { canReviewOperationalAttendance } from "./operation-workforce-attendance";

interface OperationTeamSectionProps {
  operationId: string;
  operationKind: OperationKind;
  canAssign: boolean;
  operationWorkDate: string;
  onFeedback: (message: string, severity: "success" | "error") => void;
}

function matchesEmployeeSearch(
  name: string,
  phone: string | null | undefined,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    name.toLowerCase().includes(normalized) ||
    (phone ? phone.toLowerCase().includes(normalized) : false)
  );
}

export function OperationTeamSection({
  operationId,
  operationKind,
  canAssign,
  operationWorkDate,
  onFeedback,
}: OperationTeamSectionProps) {
  const pagination = usePaginationState(10);
  const assignmentsQuery = useOperationEmployees(operationId);
  const summaryQuery = useOperationAttendanceSummary(operationId, {
    page: pagination.page,
    limit: pagination.pageSize,
  });
  const assignMutation = useAssignOperationEmployee(operationId);
  const cancelMutation = useCancelOperationAssignment(operationId);
  const endMutation = useEndOperationAssignment(operationId);
  const reviewMutation = useReviewAttendance();

  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [endTarget, setEndTarget] = useState<OperationEmployeeAssignment | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    attendanceId: string;
    decision: "APPROVE" | "REJECT";
  } | null>(null);

  const assignments = assignmentsQuery.data ?? [];
  const currentAssignments = useMemo(
    () => assignments.filter(isCurrentOperationalAssignment),
    [assignments],
  );
  const currentlyAssignedEmployeeIds = useMemo(
    () => currentAssignments.map((assignment) => assignment.employeeId),
    [currentAssignments],
  );

  const assignmentById = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.id, assignment])),
    [assignments],
  );

  const historyAssignments = useMemo(
    () => assignments.filter((item) => !isCurrentOperationalAssignment(item)),
    [assignments],
  );

  const rows = summaryQuery.data?.employees ?? [];
  const meta = summaryQuery.data?.meta;

  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        matchesEmployeeSearch(row.employee.name, row.employee.phoneNumber, searchQuery),
      ),
    [rows, searchQuery],
  );

  const handleAssignEmployees = async (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
  }) => {
    let assignedCount = 0;
    let lastError: string | null = null;

    for (const employeeId of input.employeeIds) {
      try {
        await assignMutation.mutateAsync({
          employeeId,
          ...(input.validFrom
            ? {
                validFrom: input.validFrom,
                validUntil: input.validUntil,
              }
            : {}),
        });
        assignedCount += 1;
      } catch (error) {
        const parsed = parseApiError(error);
        lastError = mapAssignmentErrorMessage(parsed.code, getApiErrorMessage(error));
      }
    }

    if (assignedCount > 0) {
      onFeedback(
        `${assignedCount} ${terminology.worker.plural.toLowerCase()} asignado(s) correctamente.`,
        "success",
      );
      setManageDialogOpen(false);
    }

    if (lastError) {
      throw new Error(lastError);
    }
  };

  const handleCancelAssignment = async (assignment: OperationEmployeeAssignment) => {
    try {
      await cancelMutation.mutateAsync(assignment.id);
      onFeedback("Asignación cancelada correctamente.", "success");
    } catch (error) {
      const parsed = parseApiError(error);
      onFeedback(
        mapAssignmentErrorMessage(parsed.code, getApiErrorMessage(error)),
        "error",
      );
    }
  };

  const handleEnd = async (effectiveDate: string) => {
    if (!endTarget) {
      return;
    }

    try {
      await endMutation.mutateAsync({
        assignmentId: endTarget.id,
        effectiveDate,
      });
      setEndTarget(null);
      onFeedback("Asignación finalizada correctamente.", "success");
    } catch (error) {
      const parsed = parseApiError(error);
      onFeedback(
        mapAssignmentErrorMessage(parsed.code, getApiErrorMessage(error)),
        "error",
      );
      throw error;
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

  return (
    <SectionCard
      title="Equipo y asistencia"
      description="Colaboradores asignados, confirmación y asistencia."
      action={
        canAssign ? (
          <Button size="compact-sm" onClick={() => setManageDialogOpen(true)}>
            Administrar equipo
          </Button>
        ) : (
          <Button
            variant="default"
            size="compact-sm"
            onClick={() => void summaryQuery.refetch()}
            loading={summaryQuery.isFetching}
          >
            Actualizar
          </Button>
        )
      }
    >
      <TextInput
        placeholder="Buscar por nombre o teléfono"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
        mb="sm"
      />

      <OperationEmployeeTable
        operationId={operationId}
        rows={filteredRows}
        loading={summaryQuery.isLoading}
        error={
          summaryQuery.isError
            ? getApiErrorMessage(summaryQuery.error, "No se pudo cargar el equipo asignado.")
            : undefined
        }
        canAssign={canAssign}
        canReviewAttendance={canReviewOperationalAttendance}
        assignmentById={assignmentById}
        operationWorkDate={operationWorkDate}
        onReviewApprove={(attendanceId) =>
          setReviewTarget({ attendanceId, decision: "APPROVE" })
        }
        onReviewReject={(attendanceId) =>
          setReviewTarget({ attendanceId, decision: "REJECT" })
        }
        onCancelAssignment={(assignment) => void handleCancelAssignment(assignment)}
        onEndAssignment={setEndTarget}
        cancelPending={cancelMutation.isPending}
        endPending={endMutation.isPending}
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
        emptyDescription={
          canAssign
            ? "Usá Administrar equipo para incorporar colaboradores."
            : `No hay ${terminology.worker.plural.toLowerCase()} asignados a esta operación.`
        }
      />

      {historyAssignments.length > 0 ? (
        <Stack gap="xs" mt="lg">
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => setHistoryOpen((current) => !current)}
            style={{ alignSelf: "flex-start" }}
          >
            {historyOpen ? "Ocultar historial" : `Ver historial (${historyAssignments.length})`}
          </Button>
          <Collapse expanded={historyOpen}>
            <OperationAssignmentList
              assignments={historyAssignments}
              operationWorkDate={operationWorkDate}
              canAssign={false}
              onCancel={() => {}}
              onEnd={() => {}}
            />
          </Collapse>
        </Stack>
      ) : null}

      {assignmentsQuery.isError ? (
        <Text size="sm" c="red" mt="sm">
          {getApiErrorMessage(assignmentsQuery.error, "No se pudieron cargar las asignaciones.")}
        </Text>
      ) : null}

      <EndAssignmentDialog
        open={Boolean(endTarget)}
        employeeName={endTarget?.employee ? endTarget.employee.name : "El colaborador"}
        loading={endMutation.isPending}
        onClose={() => setEndTarget(null)}
        onConfirm={handleEnd}
      />

      {canAssign ? (
        <OperationTeamManageDialog
          opened={manageDialogOpen}
          onClose={() => setManageDialogOpen(false)}
          operationId={operationId}
          operationKind={operationKind}
          operationWorkDate={operationWorkDate}
          excludeEmployeeIds={currentlyAssignedEmployeeIds}
          assignLoading={assignMutation.isPending}
          onAssignEmployees={handleAssignEmployees}
          onCompleted={onFeedback}
        />
      ) : null}

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
