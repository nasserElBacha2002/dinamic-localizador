import sql from "mssql";
import { env } from "../config/env";
import { getPool } from "../database/connection";
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
import type { EffectiveRecurringSchedule, ResolvedScheduleDay } from "../types/schedule";
import type { OperationWorkday } from "../types/workday";
import { isAssignmentActiveOnWorkDate } from "../utils/assignment-period";
import { recurringScheduleResolver } from "../utils/recurring-schedule-resolver";
import { buildRecurringExpectedInstants } from "../utils/recurring-workday-instant";
import {
  computeMaterializationRange,
  iterateDateIsoRange,
} from "../utils/recurring-workday-range";
import { recurringScheduleService } from "./recurring-schedule.service";
import { workdayMaterializationService } from "./workday-materialization.service";

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

const emptyResult = (operationId: string, rangeStart: string, rangeEnd: string): MaterializationResult => ({
  operationId,
  rangeStart,
  rangeEnd,
  operationWorkdaysCreated: 0,
  operationWorkdaysUpdated: 0,
  operationWorkdaysCancelled: 0,
  employeeWorkdaysCreated: 0,
  employeeWorkdaysCancelled: 0,
  unchanged: 0,
});

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

const isFutureMutableWorkday = async (
  companyId: string,
  workday: OperationWorkday,
  referenceAt = new Date(),
): Promise<boolean> => {
  if (new Date(workday.expectedStartAt) <= referenceAt) {
    return false;
  }
  return !(await operationWorkdayRepository.hasAttendanceForWorkday(companyId, workday.id));
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

const cancelEmployeeExpectationsForWorkday = async (
  companyId: string,
  operationWorkdayId: string,
  counters: MaterializationResult,
): Promise<void> => {
  const cancelled = await employeeWorkdayRepository.cancelExpectedForWorkday(
    companyId,
    operationWorkdayId,
  );
  counters.employeeWorkdaysCancelled += cancelled;
};

const materializeEmployeeWorkdaysForOperationWorkday = async (
  companyId: string,
  operationWorkday: OperationWorkday,
  activeAssignments: Map<string, OperationEmployeeAssignment>,
  counters: MaterializationResult,
): Promise<void> => {
  if (operationWorkday.status !== "ACTIVE") {
    return;
  }

  for (const assignment of activeAssignments.values()) {
    const before = await employeeWorkdayRepository.findByWorkdayAndEmployee(
      companyId,
      operationWorkday.id,
      assignment.employeeId,
    );

    await workdayMaterializationService.ensureEmployeeWorkdayForRecurringAssignment(
      companyId,
      operationWorkday,
      assignment.employeeId,
      assignment.id,
    );

    const after = await employeeWorkdayRepository.findByWorkdayAndEmployee(
      companyId,
      operationWorkday.id,
      assignment.employeeId,
    );
    if (!before && after?.expectationStatus === "EXPECTED") {
      counters.employeeWorkdaysCreated += 1;
    }
  }

  const existingWorkdays = await employeeWorkdayRepository.listByOperationWorkdayId(
    companyId,
    operationWorkday.id,
  );
  for (const employeeWorkday of existingWorkdays) {
    if (employeeWorkday.expectationStatus !== "EXPECTED") {
      continue;
    }

    const assignmentId = employeeWorkday.operationAssignmentId;
    if (!assignmentId) {
      continue;
    }

    const assignment = activeAssignments.get(employeeWorkday.employeeId);
    if (assignment?.id === assignmentId) {
      continue;
    }

    if (await employeeWorkdayRepository.hasAttendance(companyId, employeeWorkday.id)) {
      continue;
    }

    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkday.id)
      .query(`
        UPDATE employee_workdays
        SET expectation_status = 'CANCELLED',
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND id = @employeeWorkdayId
          AND expectation_status = 'EXPECTED'
      `);
    counters.employeeWorkdaysCancelled += 1;
  }
};

export const recurringWorkdayMaterializationService = {
  getHorizonDays(): number {
    return env.RECURRING_WORKDAY_HORIZON_DAYS;
  },

  async materializeOperationHorizon(companyId: string, operationId: string): Promise<MaterializationResult> {
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
      return emptyResult(operationId, schedule.validFrom, schedule.validFrom);
    }

    const counters = emptyResult(operationId, range.rangeStart, range.rangeEnd);
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

    const enabledDates = new Set<string>();

    for (const workDate of iterateDateIsoRange(range.rangeStart, range.rangeEnd)) {
      const resolvedDay = recurringScheduleResolver.resolveDay(workDate, effectiveSchedule);
      if (!resolvedDay.enabled) {
        const existing = existingByDate.get(workDate);
        if (existing && existing.status === "ACTIVE") {
          if (await isFutureMutableWorkday(companyId, existing)) {
            await operationWorkdayRepository.cancelWorkday(companyId, existing.id);
            counters.operationWorkdaysCancelled += 1;
            await cancelEmployeeExpectationsForWorkday(companyId, existing.id, counters);
            existingByDate.set(workDate, { ...existing, status: "CANCELLED" });
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
        counters,
      );
      if (!operationWorkday) {
        continue;
      }

      const activeAssignments = resolveActiveAssignmentsForWorkDate(assignments, workDate);
      await materializeEmployeeWorkdaysForOperationWorkday(
        companyId,
        operationWorkday,
        activeAssignments,
        counters,
      );
    }

    for (const workday of existingWorkdays) {
      if (enabledDates.has(workday.workDate) || workday.status !== "ACTIVE") {
        continue;
      }
      if (!(await isFutureMutableWorkday(companyId, workday))) {
        counters.unchanged += 1;
        continue;
      }
      await operationWorkdayRepository.cancelWorkday(companyId, workday.id);
      counters.operationWorkdaysCancelled += 1;
      await cancelEmployeeExpectationsForWorkday(companyId, workday.id, counters);
    }

    return counters;
  },

  async reconcileAfterAssignmentChange(
    companyId: string,
    operationId: string,
    assignment: OperationEmployeeAssignment,
  ): Promise<MaterializationResult> {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation || (operation.operationKind ?? "ONE_TIME") !== "RECURRING") {
      return emptyResult(operationId, assignment.validFrom, assignment.validUntil ?? assignment.validFrom);
    }

    const schedule = await operationScheduleRepository.findByOperationId(companyId, operationId);
    if (!schedule) {
      return emptyResult(operationId, assignment.validFrom, assignment.validFrom);
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

    const horizonRange = computeMaterializationRange({
      timezone: effectiveSchedule.timezone,
      validFrom: schedule.validFrom,
      validUntil: schedule.validUntil,
      horizonDays: env.RECURRING_WORKDAY_HORIZON_DAYS,
    });
    if (!horizonRange) {
      return emptyResult(operationId, assignment.validFrom, assignment.validFrom);
    }

    const rangeStart =
      assignment.validFrom > horizonRange.rangeStart ? assignment.validFrom : horizonRange.rangeStart;
    const rangeEnd = assignment.validUntil
      ? assignment.validUntil < horizonRange.rangeEnd
        ? assignment.validUntil
        : horizonRange.rangeEnd
      : horizonRange.rangeEnd;

    const counters = emptyResult(operationId, rangeStart, rangeEnd);
    const workdays = await operationWorkdayRepository.listByOperationAndDateRange(
      companyId,
      operationId,
      rangeStart,
      rangeEnd,
    );

    for (const workday of workdays) {
      if (workday.status !== "ACTIVE") {
        continue;
      }

      const active = isAssignmentActiveOnWorkDate({
        validFrom: assignment.validFrom,
        validUntil: assignment.validUntil,
        workDate: workday.workDate,
        cancelledAt: assignment.cancelledAt,
      });

      if (active) {
        await workdayMaterializationService.ensureEmployeeWorkdayForRecurringAssignment(
          companyId,
          workday,
          assignment.employeeId,
          assignment.id,
        );
        counters.employeeWorkdaysCreated += 1;
        continue;
      }

      const employeeWorkday = await employeeWorkdayRepository.findByWorkdayAndEmployee(
        companyId,
        workday.id,
        assignment.employeeId,
      );
      if (
        employeeWorkday &&
        employeeWorkday.operationAssignmentId === assignment.id &&
        employeeWorkday.expectationStatus === "EXPECTED"
      ) {
        if (!(await employeeWorkdayRepository.hasAttendance(companyId, employeeWorkday.id))) {
          const pool = getPool();
          await pool
            .request()
            .input("companyId", sql.UniqueIdentifier, companyId)
            .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkday.id)
            .query(`
              UPDATE employee_workdays
              SET expectation_status = 'CANCELLED',
                  updated_at = SYSUTCDATETIME()
              WHERE company_id = @companyId
                AND id = @employeeWorkdayId
                AND expectation_status = 'EXPECTED'
            `);
          counters.employeeWorkdaysCancelled += 1;
        }
      }
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

const ensureOperationWorkdayRow = async (
  companyId: string,
  operationId: string,
  snapshot: WorkdaySnapshot,
  existingByDate: Map<string, OperationWorkday>,
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
    if (!(await isFutureMutableWorkday(companyId, current))) {
      counters.unchanged += 1;
      return null;
    }
    const reactivated = await operationWorkdayRepository.updateSnapshot(companyId, current.id, snapshot);
    existingByDate.set(snapshot.workDate, reactivated);
    counters.operationWorkdaysUpdated += 1;
    return reactivated;
  }

  if (snapshotsSemanticallyEqual(current, snapshot)) {
    counters.unchanged += 1;
    return current;
  }

  if (!(await isFutureMutableWorkday(companyId, current))) {
    counters.unchanged += 1;
    return current;
  }

  const updated = await operationWorkdayRepository.updateSnapshot(companyId, current.id, snapshot);
  existingByDate.set(snapshot.workDate, updated);
  counters.operationWorkdaysUpdated += 1;
  return updated;
};
