import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { companyWorkScheduleRepository } from "../repositories/company-work-schedule.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationScheduleRepository } from "../repositories/operation-schedule.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { OperationEmployeeAssignment } from "../types/domain";
import type { CompanyMaterializationSummary, MaterializationResult } from "../types/materialization";
import {
  applyEmployeeWorkdayOutcome,
  emptyMaterializationResult,
} from "../types/materialization";
import type { EffectiveRecurringSchedule, ResolvedScheduleDay } from "../types/schedule";
import type { EmployeeWorkday, OperationWorkday } from "../types/workday";
import { isAssignmentActiveOnWorkDate } from "../utils/assignment-period";
import { recurringScheduleResolver } from "../utils/recurring-schedule-resolver";
import { buildRecurringExpectedInstants } from "../utils/recurring-workday-instant";
import {
  computeMaterializationRange,
  iterateDateIsoRange,
} from "../utils/recurring-workday-range";
import {
  buildEmployeeWorkdayIndex,
  employeeWorkdayExpectationService,
} from "./employee-workday-expectation.service";
import { employeeWorkdayAbsenceReconciliationService } from "./employee-workday-absence-reconciliation.service";
import { recurringScheduleService } from "./recurring-schedule.service";

type WorkdaySnapshot = {
  workDate: string;
  expectedStartAt: Date;
  expectedEndAt: Date;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  scheduleVersion: number;
  scheduleSourceSnapshot: "COMPANY" | "CUSTOM";
  scheduleTimezoneSnapshot: string;
  status: "ACTIVE";
};

const buildSnapshotPayload = (
  workDate: string,
  resolvedDay: ResolvedScheduleDay,
  effectiveSchedule: EffectiveRecurringSchedule,
  operation: { earlyToleranceMinutes: number; lateToleranceMinutes: number },
): WorkdaySnapshot => {
  if (!resolvedDay.startTime || !resolvedDay.endTime) {
    throw new AppError(
      409,
      "RECURRING_SCHEDULE_DATA_INCONSISTENT",
      "El día habilitado no tiene horario válido",
    );
  }

  const { expectedStartAt, expectedEndAt } = buildRecurringExpectedInstants({
    workDate,
    startTime: resolvedDay.startTime,
    endTime: resolvedDay.endTime,
    timezone: effectiveSchedule.timezone,
  });

  return {
    workDate,
    expectedStartAt,
    expectedEndAt,
    earlyToleranceMinutes: operation.earlyToleranceMinutes,
    lateToleranceMinutes: operation.lateToleranceMinutes,
    scheduleVersion: effectiveSchedule.version,
    scheduleSourceSnapshot: effectiveSchedule.scheduleSource,
    scheduleTimezoneSnapshot: effectiveSchedule.timezone,
    status: "ACTIVE",
  };
};

const snapshotsSemanticallyEqual = (workday: OperationWorkday, snapshot: WorkdaySnapshot): boolean =>
  workday.expectedStartAt === snapshot.expectedStartAt.toISOString() &&
  workday.expectedEndAt === snapshot.expectedEndAt.toISOString() &&
  workday.earlyToleranceMinutes === snapshot.earlyToleranceMinutes &&
  workday.lateToleranceMinutes === snapshot.lateToleranceMinutes &&
  workday.scheduleVersion === snapshot.scheduleVersion &&
  workday.scheduleSourceSnapshot === snapshot.scheduleSourceSnapshot &&
  workday.scheduleTimezoneSnapshot === snapshot.scheduleTimezoneSnapshot &&
  workday.status === snapshot.status;

const isFutureMutableWorkday = (
  workday: OperationWorkday,
  attendanceWorkdayIds: Set<string>,
  referenceAt = new Date(),
): boolean => {
  if (new Date(workday.expectedStartAt) <= referenceAt) {
    return false;
  }
  return !attendanceWorkdayIds.has(workday.id);
};

const resolveActiveAssignmentsForWorkDate = (
  assignments: OperationEmployeeAssignment[],
  workDate: string,
): Map<string, OperationEmployeeAssignment> => {
  const activeByEmployee = new Map<string, OperationEmployeeAssignment>();

  for (const assignment of assignments) {
    if (
      !isAssignmentActiveOnWorkDate({
        validFrom: assignment.validFrom,
        validUntil: assignment.validUntil,
        workDate,
        cancelledAt: assignment.cancelledAt,
      })
    ) {
      continue;
    }

    if (activeByEmployee.has(assignment.employeeId)) {
      throw new AppError(
        409,
        "ASSIGNMENT_PERIOD_OVERLAP",
        `Existen asignaciones superpuestas para el colaborador en la fecha ${workDate}`,
      );
    }

    activeByEmployee.set(assignment.employeeId, assignment);
  }

  return activeByEmployee;
};

const reconcileEmployeeExpectationsForWorkday = async (
  companyId: string,
  operationWorkday: OperationWorkday,
  activeAssignments: Map<string, OperationEmployeeAssignment>,
  employeeIndex: Map<string, EmployeeWorkday>,
  attendanceEmployeeWorkdayIds: Set<string>,
  counters: MaterializationResult,
): Promise<void> => {
  if (operationWorkday.status !== "ACTIVE") {
    return;
  }

  const expectedEmployeeIds = new Set(activeAssignments.keys());

  for (const assignment of activeAssignments.values()) {
    const existing = employeeIndex.get(assignment.employeeId);
    const outcome = await employeeWorkdayExpectationService.ensureExpectedForRecurringAssignment({
      companyId,
      operationWorkday,
      employeeId: assignment.employeeId,
      operationAssignmentId: assignment.id,
      existing,
      hasAttendance: existing ? attendanceEmployeeWorkdayIds.has(existing.id) : false,
    });
    applyEmployeeWorkdayOutcome(counters, outcome);
    employeeIndex.set(assignment.employeeId, outcome.employeeWorkday);
  }

  for (const [employeeId, employeeWorkday] of employeeIndex) {
    if (expectedEmployeeIds.has(employeeId)) {
      continue;
    }
    if (employeeWorkday.expectationStatus !== "EXPECTED") {
      continue;
    }
    if (attendanceEmployeeWorkdayIds.has(employeeWorkday.id)) {
      continue;
    }

    const cancelled = await employeeWorkdayRepository.cancelExpectationWithReason(
      companyId,
      employeeWorkday.id,
      "ASSIGNMENT",
    );
    if (cancelled) {
      counters.employeeWorkdaysCancelled += 1;
      employeeIndex.set(employeeId, cancelled);
    }
  }
};

const ensureOperationWorkdayRow = async (
  companyId: string,
  operationId: string,
  snapshot: WorkdaySnapshot,
  existingByDate: Map<string, OperationWorkday>,
  attendanceWorkdayIds: Set<string>,
  counters: MaterializationResult,
): Promise<OperationWorkday | null> => {
  const existing = existingByDate.get(snapshot.workDate);

  if (!existing) {
    try {
      const created = await operationWorkdayRepository.insert(companyId, {
        operationId,
        ...snapshot,
      });
      existingByDate.set(snapshot.workDate, created);
      counters.operationWorkdaysCreated += 1;
      return created;
    } catch (error) {
      if (!operationWorkdayRepository.isDuplicateKeyError(error)) {
        throw error;
      }
      const raced = await operationWorkdayRepository.findByOperationAndWorkDate(
        companyId,
        operationId,
        snapshot.workDate,
      );
      if (!raced) {
        throw error;
      }
      existingByDate.set(snapshot.workDate, raced);
    }
  }

  const current = existingByDate.get(snapshot.workDate);
  if (!current) {
    return null;
  }

  if (current.status === "CANCELLED") {
    if (
      current.cancellationReason !== "SCHEDULE" ||
      !isFutureMutableWorkday(current, attendanceWorkdayIds)
    ) {
      counters.unchanged += 1;
      return null;
    }

    const reactivated = await operationWorkdayRepository.reactivateScheduleCancelledWorkday(
      companyId,
      current.id,
      snapshot,
    );
    if (!reactivated) {
      counters.unchanged += 1;
      return current;
    }
    existingByDate.set(snapshot.workDate, reactivated);
    counters.operationWorkdaysUpdated += 1;
    return reactivated;
  }

  if (snapshotsSemanticallyEqual(current, snapshot)) {
    counters.unchanged += 1;
    return current;
  }

  if (!isFutureMutableWorkday(current, attendanceWorkdayIds)) {
    counters.unchanged += 1;
    return current;
  }

  const updated = await operationWorkdayRepository.updateSnapshot(companyId, current.id, snapshot);
  if (!updated) {
    counters.unchanged += 1;
    return current;
  }

  existingByDate.set(snapshot.workDate, updated);
  counters.operationWorkdaysUpdated += 1;
  return updated;
};

export const recurringWorkdayMaterializationService = {
  getHorizonDays(): number {
    return env.RECURRING_WORKDAY_HORIZON_DAYS;
  },

  async materializeOperationHorizon(
    companyId: string,
    operationId: string,
  ): Promise<MaterializationResult> {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    if ((operation.operationKind ?? "ONE_TIME") !== "RECURRING") {
      throw new AppError(
        409,
        "OPERATION_NOT_RECURRING",
        "Esta acción solo está disponible para operaciones habituales",
      );
    }

    if (operation.status === "CANCELLED" || operation.status === "COMPLETED") {
      throw new AppError(
        409,
        "OPERATION_NOT_MATERIALIZABLE",
        "No se pueden materializar jornadas para operaciones canceladas o completadas",
      );
    }

    const schedule = await operationScheduleRepository.findByOperationId(companyId, operationId);
    if (!schedule) {
      throw new AppError(404, "OPERATION_SCHEDULE_NOT_FOUND", "La operación no tiene horario configurado");
    }

    const companySchedule =
      schedule.scheduleSource === "COMPANY"
        ? await companyWorkScheduleRepository.findByCompanyId(companyId)
        : null;
    const effectiveSchedule = await recurringScheduleService.resolveEffectiveSchedule(
      companyId,
      schedule,
      companySchedule,
    );

    const range = computeMaterializationRange({
      timezone: effectiveSchedule.timezone,
      validFrom: schedule.validFrom,
      validUntil: schedule.validUntil,
      horizonDays: env.RECURRING_WORKDAY_HORIZON_DAYS,
    });

    if (!range) {
      return emptyMaterializationResult(operationId, schedule.validFrom, schedule.validFrom);
    }

    const counters = emptyMaterializationResult(operationId, range.rangeStart, range.rangeEnd);
    const existingWorkdays = await operationWorkdayRepository.listByOperationAndDateRange(
      companyId,
      operationId,
      range.rangeStart,
      range.rangeEnd,
    );
    const existingByDate = new Map(existingWorkdays.map((workday) => [workday.workDate, workday]));

    const assignments = await operationEmployeeRepository.listOverlappingForOperationInDateRange(
      companyId,
      operationId,
      range.rangeStart,
      range.rangeEnd,
    );

    const employeeWorkdays = await employeeWorkdayRepository.listByOperationWorkdayIds(
      companyId,
      existingWorkdays.map((workday) => workday.id),
    );
    const employeeWorkdayIndex = buildEmployeeWorkdayIndex(employeeWorkdays);
    const attendanceEmployeeWorkdayIds =
      await employeeWorkdayRepository.listAttendancePresenceForEmployeeWorkdayIds(
        companyId,
        employeeWorkdays.map((workday) => workday.id),
      );
    const attendanceWorkdayIds = new Set(
      employeeWorkdays
        .filter((workday) => attendanceEmployeeWorkdayIds.has(workday.id))
        .map((workday) => workday.operationWorkdayId),
    );

    const enabledDates = new Set<string>();
    const referenceAt = new Date();

    for (const workDate of iterateDateIsoRange(range.rangeStart, range.rangeEnd)) {
      const resolvedDay = recurringScheduleResolver.resolveDay(workDate, effectiveSchedule);
      if (!resolvedDay.enabled) {
        const existing = existingByDate.get(workDate);
        if (existing && existing.status === "ACTIVE") {
          if (isFutureMutableWorkday(existing, attendanceWorkdayIds, referenceAt)) {
            await operationWorkdayRepository.cancelWorkday(companyId, existing.id, "SCHEDULE");
            counters.operationWorkdaysCancelled += 1;
            const cancelledEmployees = await employeeWorkdayRepository.cancelExpectedForWorkday(
              companyId,
              existing.id,
              "SCHEDULE",
              attendanceEmployeeWorkdayIds,
            );
            counters.employeeWorkdaysCancelled += cancelledEmployees;
            existingByDate.set(workDate, {
              ...existing,
              status: "CANCELLED",
              cancellationReason: "SCHEDULE",
            });
          } else {
            counters.unchanged += 1;
          }
        }
        continue;
      }

      enabledDates.add(workDate);
      const snapshot = buildSnapshotPayload(workDate, resolvedDay, effectiveSchedule, operation);
      const operationWorkday = await ensureOperationWorkdayRow(
        companyId,
        operationId,
        snapshot,
        existingByDate,
        attendanceWorkdayIds,
        counters,
      );
      if (!operationWorkday) {
        continue;
      }

      if (!employeeWorkdayIndex.has(operationWorkday.id)) {
        employeeWorkdayIndex.set(operationWorkday.id, new Map());
      }

      const activeAssignments = resolveActiveAssignmentsForWorkDate(assignments, workDate);
      await reconcileEmployeeExpectationsForWorkday(
        companyId,
        operationWorkday,
        activeAssignments,
        employeeWorkdayIndex.get(operationWorkday.id)!,
        attendanceEmployeeWorkdayIds,
        counters,
      );
    }

    for (const workday of existingWorkdays) {
      if (enabledDates.has(workday.workDate) || workday.status !== "ACTIVE") {
        continue;
      }
      if (!isFutureMutableWorkday(workday, attendanceWorkdayIds, referenceAt)) {
        counters.unchanged += 1;
        continue;
      }
      await operationWorkdayRepository.cancelWorkday(companyId, workday.id, "SCHEDULE");
      counters.operationWorkdaysCancelled += 1;
      const cancelledEmployees = await employeeWorkdayRepository.cancelExpectedForWorkday(
        companyId,
        workday.id,
        "SCHEDULE",
        attendanceEmployeeWorkdayIds,
      );
      counters.employeeWorkdaysCancelled += cancelledEmployees;
    }

    const employeeWorkdayIds = [...employeeWorkdayIndex.values()].flatMap((byEmployee) =>
      [...byEmployee.values()].map((workday) => workday.id),
    );
    counters.absenceReconciliation =
      await employeeWorkdayAbsenceReconciliationService.reconcileEmployeeWorkdays(
        companyId,
        employeeWorkdayIds,
      );

    return counters;
  },

  async reconcileAfterAssignmentChange(
    companyId: string,
    operationId: string,
    _assignment: OperationEmployeeAssignment,
  ): Promise<MaterializationResult> {
    return this.materializeOperationHorizon(companyId, operationId);
  },

  async reconcileFutureWorkdaysForCancelledOperation(
    companyId: string,
    operationId: string,
  ): Promise<MaterializationResult> {
    const referenceAt = new Date();
    const futureWorkdays = await operationWorkdayRepository.listFutureMutableByOperation(
      companyId,
      operationId,
      referenceAt,
    );

    const counters = emptyMaterializationResult(operationId, "", "");
    if (futureWorkdays.length === 0) {
      return counters;
    }

    const employeeWorkdays = await employeeWorkdayRepository.listByOperationWorkdayIds(
      companyId,
      futureWorkdays.map((workday) => workday.id),
    );
    const attendanceEmployeeWorkdayIds =
      await employeeWorkdayRepository.listAttendancePresenceForEmployeeWorkdayIds(
        companyId,
        employeeWorkdays.map((workday) => workday.id),
      );

    for (const workday of futureWorkdays) {
      await operationWorkdayRepository.cancelWorkday(companyId, workday.id, "OPERATION");
      counters.operationWorkdaysCancelled += 1;
      const cancelledEmployees = await employeeWorkdayRepository.cancelExpectedForWorkday(
        companyId,
        workday.id,
        "OPERATION",
        attendanceEmployeeWorkdayIds,
      );
      counters.employeeWorkdaysCancelled += cancelledEmployees;
    }

    return counters;
  },

  async reconcileCompanyScheduleOperations(companyId: string): Promise<CompanyMaterializationSummary> {
    const operations = await operationScheduleRepository.listRecurringCompanySourceOperationIds(companyId);
    const summary: CompanyMaterializationSummary = {
      operationsProcessed: 0,
      operationsFailed: 0,
      results: [],
      failures: [],
    };

    for (const operationId of operations) {
      try {
        const result = await this.materializeOperationHorizon(companyId, operationId);
        summary.operationsProcessed += 1;
        summary.results.push(result);
      } catch (error) {
        summary.operationsFailed += 1;
        summary.failures.push({
          operationId,
          message: error instanceof Error ? error.message : "Error desconocido",
        });
        console.error("[recurring-workday-materialization] company schedule reconciliation failed", {
          companyId,
          operationId,
          error,
        });
      }
    }

    return summary;
  },

  async materializeAllCompaniesHorizon(): Promise<CompanyMaterializationSummary> {
    const companies = await companyRepository.listActive();
    const aggregate: CompanyMaterializationSummary = {
      operationsProcessed: 0,
      operationsFailed: 0,
      results: [],
      failures: [],
    };

    for (const company of companies) {
      const operations = await operationScheduleRepository.listMaterializableRecurringOperationIds(
        company.id,
      );
      for (const operationId of operations) {
        try {
          const result = await this.materializeOperationHorizon(company.id, operationId);
          aggregate.operationsProcessed += 1;
          aggregate.results.push(result);
        } catch (error) {
          aggregate.operationsFailed += 1;
          aggregate.failures.push({
            operationId,
            message: error instanceof Error ? error.message : "Error desconocido",
          });
          console.error("[recurring-workday-materialization] operation failed", {
            companyId: company.id,
            operationId,
            error,
          });
        }
      }
    }

    return aggregate;
  },
};
