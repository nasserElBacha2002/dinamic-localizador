import { Button, Collapse, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
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
import type { OperationWorkdaySummary } from "../../types/operation-workday";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage, parseApiError } from "../../utils/errors";
import {
  buildTeamWorkdaySelectOptions,
  formatTeamWorkdayLabel,
  type OperationTeamWorkdaySelection,
} from "../../utils/operation-team-workday";
import { EndAssignmentDialog } from "./EndAssignmentDialog";
import { OperationAssignmentList } from "./OperationAssignmentList";
import { OperationEmployeeTable } from "./OperationEmployeeTable";
import { OperationTeamManageDialog } from "./OperationTeamManageDialog";
import type { AssignEmployeesResult } from "./OperationIndividualAssignmentPanel";
import {
  isCurrentOperationalAssignment,
  mapAssignmentErrorMessage,
  resolveAssignmentBatchStatus,
} from "./operation-assignment-display";
import { canReviewOperationalAttendance } from "./operation-workforce-attendance";

interface OperationTeamSectionProps {
  operationId: string;
  operationKind: OperationKind;
  canAssign: boolean;
  operationWorkDate: string;
  operationalToday: string;
  workdayOptions: OperationWorkdaySummary[];
  selectedWorkday: OperationTeamWorkdaySelection | null;
  onWorkdayChange: (selection: OperationTeamWorkdaySelection | null) => void;
  onFeedback: (message: string, severity: "success" | "error") => void;
}

export function OperationTeamSection({
  operationId,
  operationKind,
  canAssign,
  operationWorkDate,
  operationalToday,
  workdayOptions,
  selectedWorkday,
  onWorkdayChange,
  onFeedback,
}: OperationTeamSectionProps) {
  const isRecurring = operationKind === "RECURRING";
  const pagination = usePaginationState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const trimmedSearch = debouncedSearch.trim();

  const summaryFilters = useMemo(
    () => ({
      page: pagination.page,
      limit: pagination.pageSize,
      ...(trimmedSearch ? { search: trimmedSearch } : {}),
      ...(selectedWorkday?.workdayId ? { workdayId: selectedWorkday.workdayId } : {}),
      ...(selectedWorkday?.workDate ? { workDate: selectedWorkday.workDate } : {}),
    }),
    [pagination.page, pagination.pageSize, trimmedSearch, selectedWorkday],
  );

  const assignmentsQuery = useOperationEmployees(operationId);
  const summaryQuery = useOperationAttendanceSummary(operationId, summaryFilters);
  const assignMutation = useAssignOperationEmployee(operationId);
  const cancelMutation = useCancelOperationAssignment(operationId);
  const endMutation = useEndOperationAssignment(operationId);
  const reviewMutation = useReviewAttendance();

  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [endTarget, setEndTarget] = useState<OperationEmployeeAssignment | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { onPageChange } = pagination;
  useEffect(() => {
    onPageChange(1);
  }, [trimmedSearch, selectedWorkday?.workdayId, onPageChange]);

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
  const isSearchPending = searchQuery.trim() !== trimmedSearch;
  const workdaySelectOptions = useMemo(
    () => buildTeamWorkdaySelectOptions(workdayOptions, operationalToday),
    [workdayOptions, operationalToday],
  );
  const selectedWorkdayLabel = selectedWorkday
    ? formatTeamWorkdayLabel(selectedWorkday.workDate, operationalToday)
    : null;
  const noWorkdayForToday = isRecurring && !selectedWorkday;

  const handleAssignEmployees = async (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
  }): Promise<AssignEmployeesResult> => {
    const added: string[] = [];
    const skipped: AssignEmployeesResult["skipped"] = [];

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
        added.push(employeeId);
      } catch (error) {
        const parsed = parseApiError(error);
        skipped.push({
          employeeId,
          reason: mapAssignmentErrorMessage(parsed.code, getApiErrorMessage(error)),
        });
      }
    }

    const status = resolveAssignmentBatchStatus(added.length, skipped.length);

    if (added.length > 0) {
      onFeedback(
        `${added.length} ${terminology.worker.plural.toLowerCase()} asignado(s) correctamente.`,
        "success",
      );
    }
    if (status === "error") {
      onFeedback(
        skipped[0]?.reason ?? "No se pudo completar la asignación.",
        "error",
      );
    }

    return { status, added, skipped };
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
      description={
        isRecurring
          ? "Colaboradores, confirmación y asistencia de la jornada seleccionada."
          : "Colaboradores asignados, confirmación y asistencia."
      }
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
      {isRecurring ? (
        <Group align="flex-end" mb="sm" wrap="wrap">
          <Select
            label="Jornada"
            placeholder="Seleccioná una jornada"
            data={workdaySelectOptions}
            value={selectedWorkday?.workdayId ?? null}
            onChange={(workdayId) => {
              if (!workdayId) {
                onWorkdayChange(null);
                return;
              }
              const workday = workdayOptions.find((item) => item.id === workdayId);
              if (!workday) {
                onWorkdayChange(null);
                return;
              }
              onWorkdayChange({ workdayId: workday.id, workDate: workday.workDate });
            }}
            searchable
            nothingFoundMessage="No hay jornadas materializadas"
            style={{ minWidth: 280, flex: 1 }}
          />
          {selectedWorkdayLabel ? (
            <Text size="sm" c="dimmed" pb={6}>
              Mostrando {selectedWorkdayLabel}
            </Text>
          ) : null}
        </Group>
      ) : null}

      {noWorkdayForToday ? (
        <Text size="sm" c="dimmed" mb="sm">
          No hay una jornada programada para hoy.
        </Text>
      ) : null}

      <TextInput
        placeholder="Buscar por nombre, teléfono o documento"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
        mb="sm"
        disabled={isRecurring && !selectedWorkday}
      />

      <OperationEmployeeTable
        operationId={operationId}
        rows={rows}
        loading={summaryQuery.isLoading || isSearchPending}
        error={
          summaryQuery.isError
            ? getApiErrorMessage(summaryQuery.error, "No se pudo cargar el equipo asignado.")
            : undefined
        }
        canAssign={canAssign}
        canReviewAttendance={canReviewOperationalAttendance}
        assignmentById={assignmentById}
        operationWorkDate={selectedWorkday?.workDate ?? operationWorkDate}
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
        emptyTitle={
          noWorkdayForToday
            ? "No hay jornada para hoy"
            : `No hay ${terminology.worker.plural.toLowerCase()} asignados`
        }
        emptyDescription={
          noWorkdayForToday
            ? "Seleccioná otra jornada materializada o actualizá las jornadas programadas."
            : canAssign
              ? "Usá Administrar equipo para incorporar colaboradores."
              : `No hay ${terminology.worker.plural.toLowerCase()} asignados a esta jornada.`
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
              operationWorkDate={selectedWorkday?.workDate ?? operationWorkDate}
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
          operationWorkDate={selectedWorkday?.workDate ?? operationWorkDate}
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
