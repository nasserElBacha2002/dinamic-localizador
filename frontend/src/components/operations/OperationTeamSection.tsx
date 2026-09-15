import { Button, Collapse, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { ReviewAttendanceDialog } from "../attendance/ReviewAttendanceDialog";
import { ResponsiveModal, SectionCard } from "../../design-system";
import { useReviewAttendance } from "../../hooks/useAttendance";
import {
  useAssignOperationEmployee,
  useAssignOperationEmployeesBatch,
  useCancelOperationAssignment,
  useEndOperationAssignment,
  useOperationAttendanceSummary,
  useOperationEmployees,
} from "../../hooks/useOperations";
import { useOperationShifts } from "../../hooks/useOperationShifts";
import { usePaginationState } from "../../hooks/usePaginationState";
import type { OperationEmployeeAssignment, OperationKind } from "../../types/operation";
import type { ScheduleMode } from "../../types/operation-shift";
import type { OperationWorkdaySummary } from "../../types/operation-workday";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage, parseApiError } from "../../utils/errors";
import { getRelatedName } from "../../utils/display-safe";
import {
  buildAssignEmployeePayload,
  buildAssignEmployeesBatchPayload,
} from "../../utils/operation-shift-payload";
import {
  buildTeamWorkdaySelectOptions,
  formatTeamWorkdayLabel,
  type OperationTeamWorkdaySelection,
} from "../../utils/operation-team-workday";
import { EndAssignmentDialog } from "./EndAssignmentDialog";
import { OperationAssignmentList } from "./OperationAssignmentList";
import { OperationEmployeeTable } from "./OperationEmployeeTable";
import { OperationTeamManageDialog } from "./OperationTeamManageDialog";
import {
  OperationIndividualAssignmentPanel,
  type AssignEmployeesResult,
  type CoverageAssignmentTarget,
} from "./OperationIndividualAssignmentPanel";
import {
  isCurrentOperationalAssignment,
  mapAssignmentErrorMessage,
  resolveAssignmentBatchStatus,
} from "./operation-assignment-display";
import { canReviewOperationalAttendance } from "./operation-workforce-attendance";

interface OperationTeamSectionProps {
  operationId: string;
  operationKind: OperationKind;
  scheduleMode?: ScheduleMode;
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
  scheduleMode = "SINGLE",
  canAssign,
  operationWorkDate,
  operationalToday,
  workdayOptions,
  selectedWorkday,
  onWorkdayChange,
  onFeedback,
}: OperationTeamSectionProps) {
  const isRecurring = operationKind === "RECURRING";
  const isMultiShift = scheduleMode === "MULTI_SHIFT";
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
  const shiftsQuery = useOperationShifts(operationId, { activeOnly: true }, isMultiShift);
  const summaryQuery = useOperationAttendanceSummary(operationId, summaryFilters);
  const assignBatchMutation = useAssignOperationEmployeesBatch(operationId);
  const assignEmployeeMutation = useAssignOperationEmployee(operationId);
  const cancelMutation = useCancelOperationAssignment(operationId);
  const endMutation = useEndOperationAssignment(operationId);
  const reviewMutation = useReviewAttendance();

  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [coverageTarget, setCoverageTarget] = useState<CoverageAssignmentTarget | null>(null);
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
  const shiftOptions = useMemo(
    () =>
      (shiftsQuery.data ?? [])
        .filter((shift) => shift.isActive)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "es"),
        )
        .map((shift) => ({ value: shift.id, label: `${shift.name} (${shift.code})` })),
    [shiftsQuery.data],
  );
  const currentlyAssignedEmployeeIds = useMemo(
    () =>
      assignments
        .filter(isCurrentOperationalAssignment)
        .map((assignment) => assignment.employeeId),
    [assignments],
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
  const selectedWorkdaySummary = selectedWorkday
    ? workdayOptions.find((workday) => workday.id === selectedWorkday.workdayId)
    : null;
  const selectedWorkdayLabel = selectedWorkday
    ? formatTeamWorkdayLabel(
        selectedWorkday.workDate,
        operationalToday,
        selectedWorkdaySummary?.shiftNameSnapshot ??
          selectedWorkdaySummary?.shiftCodeSnapshot,
      )
    : null;
  const noWorkdayForToday = isRecurring && !selectedWorkday;
  const ambiguousTodayWorkdays =
    isRecurring &&
    isMultiShift &&
    !selectedWorkday &&
    workdayOptions.filter((workday) => workday.workDate === operationalToday).length > 1;

  const handleAssignEmployees = async (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
    operationShiftId?: string | null;
    asCoverage?: boolean;
    replacedAssignmentId?: string;
    replacedEmployeeId?: string;
  }): Promise<AssignEmployeesResult> => {
    if (input.asCoverage) {
      const employeeId = input.employeeIds[0];
      if (!employeeId || !input.replacedAssignmentId) {
        const message = "Faltan datos para registrar la cobertura.";
        onFeedback(message, "error");
        return { status: "error", added: [], skipped: [] };
      }

      try {
        const payload = buildAssignEmployeePayload(scheduleMode, {
          employeeId,
          asCoverage: true,
          replacedAssignmentId: input.replacedAssignmentId,
          replacedEmployeeId: input.replacedEmployeeId,
          ...(input.validFrom
            ? {
                validFrom: input.validFrom,
                validUntil: input.validUntil,
              }
            : {}),
        });
        const assignment = await assignEmployeeMutation.mutateAsync(payload);
        onFeedback("Cobertura asignada correctamente.", "success");
        return { status: "success", added: [assignment.employeeId], skipped: [] };
      } catch (error) {
        const message = mapAssignmentErrorMessage(
          parseApiError(error).code,
          getApiErrorMessage(error),
        );
        onFeedback(message, "error");
        throw new Error(message, { cause: error });
      }
    }

    try {
      const payload = buildAssignEmployeesBatchPayload(scheduleMode, {
        employeeIds: input.employeeIds,
        operationShiftId: input.operationShiftId,
        ...(input.validFrom
          ? {
              validFrom: input.validFrom,
              validUntil: input.validUntil,
            }
          : {}),
      });
      const result = await assignBatchMutation.mutateAsync(payload);

      const added = result.assignedIds;
      const skipped: AssignEmployeesResult["skipped"] = result.skipped.map((item) => ({
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        code: item.code,
        reason: mapAssignmentErrorMessage(item.code, item.reason),
      }));
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
    } catch (error) {
      const message = mapAssignmentErrorMessage(
        parseApiError(error).code,
        getApiErrorMessage(error),
      );
      onFeedback(message, "error");
      throw error;
    }
  };

  const openCoverageForAssignment = (assignment: OperationEmployeeAssignment) => {
    const shiftLabel = assignment.operationShiftId
      ? shiftOptions.find((option) => option.value === assignment.operationShiftId)?.label ?? null
      : null;
    setCoverageTarget({
      replacedAssignmentId: assignment.id,
      replacedEmployeeId: assignment.employeeId,
      replacedEmployeeName: assignment.employee ? getRelatedName(assignment.employee) : undefined,
      operationShiftId: assignment.operationShiftId ?? null,
      shiftLabel,
    });
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

      {ambiguousTodayWorkdays ? (
        <Text size="sm" c="dimmed" mb="sm">
          Hay varios turnos para hoy. Seleccioná la jornada con el turno que querés ver.
        </Text>
      ) : noWorkdayForToday ? (
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
        onCoverAssignment={openCoverageForAssignment}
        cancelPending={cancelMutation.isPending}
        endPending={endMutation.isPending}
        coverPending={assignEmployeeMutation.isPending}
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
            ? "Seleccioná otra jornada materializada."
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
          scheduleMode={scheduleMode}
          operationWorkDate={selectedWorkday?.workDate ?? operationWorkDate}
          excludeEmployeeIds={currentlyAssignedEmployeeIds}
          shiftOptions={shiftOptions}
          assignLoading={assignBatchMutation.isPending}
          onAssignEmployees={handleAssignEmployees}
          onCompleted={onFeedback}
        />
      ) : null}

      {canAssign ? (
        <ResponsiveModal
          opened={Boolean(coverageTarget)}
          onClose={() => setCoverageTarget(null)}
          title="Cubrir / reemplazar"
          size="md"
          bodyMode="scroll"
        >
          {coverageTarget ? (
            <OperationIndividualAssignmentPanel
              key={`coverage:${coverageTarget.replacedAssignmentId}`}
              operationKind={operationKind}
              scheduleMode={scheduleMode}
              operationWorkDate={selectedWorkday?.workDate ?? operationWorkDate}
              excludeEmployeeIds={currentlyAssignedEmployeeIds}
              shiftOptions={shiftOptions}
              coverageTarget={coverageTarget}
              loading={assignEmployeeMutation.isPending}
              onAssign={handleAssignEmployees}
              onResult={(result) => {
                if (result.status === "success") {
                  setCoverageTarget(null);
                }
              }}
            />
          ) : null}
        </ResponsiveModal>
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
