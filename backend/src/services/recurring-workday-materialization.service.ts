import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { companyWorkScheduleRepository } from "../repositories/company-work-schedule.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationScheduleRepository } from "../repositories/operation-schedule.repository";
import { operationShiftExceptionRepository } from "../repositories/operation-shift-exception.repository";
import { operationShiftRepository } from "../repositories/operation-shift.repository";
import { operationShiftVersionRepository } from "../repositories/operation-shift-version.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { OperationEmployeeAssignment } from "../types/domain";
import type { CompanyMaterializationSummary, MaterializationResult } from "../types/materialization";
import {
  applyEmployeeWorkdayOutcome,
  emptyMaterializationResult,
} from "../types/materialization";
import type { OperationShift, OperationShiftVersion } from "../types/operation-shift";
import type { EffectiveRecurringSchedule, ResolvedScheduleDay } from "../types/schedule";
import type { EmployeeWorkday, OperationWorkday } from "../types/workday";
import { isAssignmentActiveOnWorkDate } from "../utils/assignment-period";
import {
  isDayEnabled,
  resolveShiftScheduleForDate,
  resolveVersionForDate,
} from "../utils/operation-shift-version-resolver";
import { resolveOperationTimezone } from "../utils/operation-timezone";
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
import {
  buildMultiShiftWorkdaySnapshot,
  workdayShiftKey,
  type MultiShiftWorkdaySnapshot,
} from "./multi-shift-workday-snapshot";
import { reconcileShiftWorkdayInTransaction } from "./operation-shift-workday-reconcile.service";
import { getPool } from "../database/connection";
import sql from "mssql";

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
  // EXCEPTION-cancelled workdays must not be treated as schedule-reactivatable
  // by the horizon loop; RESTORE goes through reconcileShiftWorkdayInTransaction.
  if (workday.status === "CANCELLED" && workday.cancellationReason === "EXCEPTION") {
    return false;
  }
  if (new Date(workday.expectedStartAt) <= referenceAt) {
    return false;
  }
  return !attendanceWorkdayIds.has(workday.id);
};

/**
 * SINGLE: one assignment per employee per date (throws on duplicate).
 * MULTI_SHIFT: pass operationShiftId to filter; same employee on different shifts is OK.
 */
const resolveActiveAssignmentsForWorkDate = (
  assignments: OperationEmployeeAssignment[],
  workDate: string,
  options?: { operationShiftId?: string | null },
): Map<string, OperationEmployeeAssignment> => {
  const activeByEmployee = new Map<string, OperationEmployeeAssignment>();
  const filterShiftId = options?.operationShiftId;

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

    if (filterShiftId !== undefined) {
      if ((assignment.operationShiftId ?? null) !== (filterShiftId ?? null)) {
        continue;
      }
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

const multiSnapshotsEqual = (
  workday: OperationWorkday,
  snapshot: MultiShiftWorkdaySnapshot,
): boolean =>
  workday.expectedStartAt === snapshot.expectedStartAt.toISOString() &&
  workday.expectedEndAt === snapshot.expectedEndAt.toISOString() &&
  workday.earlyToleranceMinutes === snapshot.earlyToleranceMinutes &&
  workday.lateToleranceMinutes === snapshot.lateToleranceMinutes &&
  workday.operationShiftVersionId === snapshot.operationShiftVersionId &&
  workday.shiftCodeSnapshot === snapshot.shiftCodeSnapshot &&
  workday.shiftNameSnapshot === snapshot.shiftNameSnapshot &&
  workday.scheduleTimezoneSnapshot === snapshot.scheduleTimezoneSnapshot &&
  workday.status === snapshot.status;

const ensureMultiShiftOperationWorkdayRow = async (
  companyId: string,
  operationId: string,
  snapshot: MultiShiftWorkdaySnapshot,
  existingByShiftDate: Map<string, OperationWorkday>,
  attendanceWorkdayIds: Set<string>,
  counters: MaterializationResult,
): Promise<OperationWorkday | null> => {
  const key = workdayShiftKey(snapshot.workDate, snapshot.operationShiftId);
  const existing = existingByShiftDate.get(key);

  if (!existing) {
    try {
      const created = await operationWorkdayRepository.insert(companyId, {
        operationId,
        workDate: snapshot.workDate,
        operationShiftId: snapshot.operationShiftId,
        operationShiftVersionId: snapshot.operationShiftVersionId,
        shiftCodeSnapshot: snapshot.shiftCodeSnapshot,
        shiftNameSnapshot: snapshot.shiftNameSnapshot,
        expectedStartAt: snapshot.expectedStartAt,
        expectedEndAt: snapshot.expectedEndAt,
        earlyToleranceMinutes: snapshot.earlyToleranceMinutes,
        lateToleranceMinutes: snapshot.lateToleranceMinutes,
        scheduleVersion: snapshot.scheduleVersion,
        scheduleSourceSnapshot: snapshot.scheduleSourceSnapshot,
        scheduleTimezoneSnapshot: snapshot.scheduleTimezoneSnapshot,
        status: snapshot.status,
      });
      existingByShiftDate.set(key, created);
      counters.operationWorkdaysCreated += 1;
      return created;
    } catch (error) {
      if (!operationWorkdayRepository.isDuplicateKeyError(error)) {
        throw error;
      }
      const raced = await operationWorkdayRepository.findByOperationWorkDateAndShift(
        companyId,
        operationId,
        snapshot.workDate,
        snapshot.operationShiftId,
      );
      if (!raced) {
        throw error;
      }
      existingByShiftDate.set(key, raced);
    }
  }

  const current = existingByShiftDate.get(key);
  if (!current) {
    return null;
  }

  if (current.status === "CANCELLED") {
    // Never reactivate EXCEPTION (or OPERATION) via schedule rematerialization.
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
      {
        expectedStartAt: snapshot.expectedStartAt,
        expectedEndAt: snapshot.expectedEndAt,
        earlyToleranceMinutes: snapshot.earlyToleranceMinutes,
        lateToleranceMinutes: snapshot.lateToleranceMinutes,
        scheduleVersion: snapshot.scheduleVersion,
        scheduleSourceSnapshot: snapshot.scheduleSourceSnapshot,
        scheduleTimezoneSnapshot: snapshot.scheduleTimezoneSnapshot,
      },
    );
    if (!reactivated) {
      counters.unchanged += 1;
      return current;
    }
    // Persist shift version snapshots after reactivation.
    const withVersion =
      (await operationWorkdayRepository.updateSnapshot(companyId, reactivated.id, {
        expectedStartAt: snapshot.expectedStartAt,
        expectedEndAt: snapshot.expectedEndAt,
        earlyToleranceMinutes: snapshot.earlyToleranceMinutes,
        lateToleranceMinutes: snapshot.lateToleranceMinutes,
        scheduleVersion: Math.max(reactivated.scheduleVersion, snapshot.scheduleVersion),
        scheduleSourceSnapshot: snapshot.scheduleSourceSnapshot,
        scheduleTimezoneSnapshot: snapshot.scheduleTimezoneSnapshot,
        status: "ACTIVE",
        operationShiftVersionId: snapshot.operationShiftVersionId,
        shiftCodeSnapshot: snapshot.shiftCodeSnapshot,
        shiftNameSnapshot: snapshot.shiftNameSnapshot,
      })) ?? reactivated;
    existingByShiftDate.set(key, withVersion);
    counters.operationWorkdaysUpdated += 1;
    return withVersion;
  }

  if (multiSnapshotsEqual(current, snapshot)) {
    counters.unchanged += 1;
    return current;
  }

  if (!isFutureMutableWorkday(current, attendanceWorkdayIds)) {
    counters.unchanged += 1;
    return current;
  }

  const nextVersion = Math.max(current.scheduleVersion + 1, snapshot.scheduleVersion);
  const updated = await operationWorkdayRepository.updateSnapshot(companyId, current.id, {
    expectedStartAt: snapshot.expectedStartAt,
    expectedEndAt: snapshot.expectedEndAt,
    earlyToleranceMinutes: snapshot.earlyToleranceMinutes,
    lateToleranceMinutes: snapshot.lateToleranceMinutes,
    scheduleVersion: nextVersion,
    scheduleSourceSnapshot: snapshot.scheduleSourceSnapshot,
    scheduleTimezoneSnapshot: snapshot.scheduleTimezoneSnapshot,
    status: "ACTIVE",
    operationShiftVersionId: snapshot.operationShiftVersionId,
    shiftCodeSnapshot: snapshot.shiftCodeSnapshot,
    shiftNameSnapshot: snapshot.shiftNameSnapshot,
  });
  if (!updated) {
    counters.unchanged += 1;
    return current;
  }

  existingByShiftDate.set(key, updated);
  counters.operationWorkdaysUpdated += 1;
  return updated;
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

  /**
   * MULTI_SHIFT materialization: one workday per (workDate, operationShiftId).
   * Optional explicit range (ONE_TIME single date); otherwise uses horizon + schedule bounds.
   */
  async materializeMultiShiftOperationHorizon(
    companyId: string,
    operationId: string,
    options?: { rangeStart?: string; rangeEnd?: string },
  ): Promise<MaterializationResult> {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }
    if (operation.scheduleMode !== "MULTI_SHIFT") {
      throw new AppError(
        409,
        "OPERATION_NOT_MULTI_SHIFT",
        "Esta materialización solo aplica a operaciones multi-turno",
      );
    }
    if (operation.status === "CANCELLED" || operation.status === "COMPLETED") {
      throw new AppError(
        409,
        "OPERATION_NOT_MATERIALIZABLE",
        "No se pueden materializar jornadas para operaciones canceladas o completadas",
      );
    }

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);

    let rangeStart = options?.rangeStart;
    let rangeEnd = options?.rangeEnd;

    if (!rangeStart || !rangeEnd) {
      const schedule = await operationScheduleRepository.findByOperationId(companyId, operationId);
      const validFrom = schedule?.validFrom ?? options?.rangeStart;
      if (!validFrom && !options?.rangeStart) {
        // Fall back to horizon from "today" when no schedule row exists.
        const computed = computeMaterializationRange({
          timezone,
          validFrom: "1970-01-01",
          validUntil: schedule?.validUntil ?? null,
          horizonDays: env.RECURRING_WORKDAY_HORIZON_DAYS,
        });
        if (!computed) {
          return emptyMaterializationResult(operationId, "", "");
        }
        rangeStart = computed.rangeStart;
        rangeEnd = computed.rangeEnd;
      } else {
        const computed = computeMaterializationRange({
          timezone,
          validFrom: validFrom ?? rangeStart!,
          validUntil: schedule?.validUntil ?? null,
          horizonDays: env.RECURRING_WORKDAY_HORIZON_DAYS,
        });
        if (!computed) {
          return emptyMaterializationResult(
            operationId,
            validFrom ?? "",
            validFrom ?? "",
          );
        }
        rangeStart = computed.rangeStart;
        rangeEnd = computed.rangeEnd;
      }
    }

    const counters = emptyMaterializationResult(operationId, rangeStart, rangeEnd);

    const activeShifts = await operationShiftRepository.listByOperationId(
      companyId,
      operationId,
      true,
    );
    if (activeShifts.length === 0) {
      return counters;
    }

    const versionsByShiftId = new Map<string, OperationShiftVersion[]>();
    for (const shift of activeShifts) {
      const versions = await operationShiftVersionRepository.listByShiftId(companyId, shift.id);
      versionsByShiftId.set(shift.id, versions);
    }

    const exceptions = await operationShiftExceptionRepository.listByOperationAndDateRange(
      companyId,
      operationId,
      rangeStart,
      rangeEnd,
    );
    const exceptionByShiftDate = new Map(
      exceptions.map((row) => [workdayShiftKey(row.workDate, row.operationShiftId), row]),
    );

    const existingWorkdays = await operationWorkdayRepository.listByOperationAndDateRange(
      companyId,
      operationId,
      rangeStart,
      rangeEnd,
    );
    const existingByShiftDate = new Map<string, OperationWorkday>();
    for (const workday of existingWorkdays) {
      if (!workday.operationShiftId) {
        continue;
      }
      existingByShiftDate.set(
        workdayShiftKey(workday.workDate, workday.operationShiftId),
        workday,
      );
    }

    const assignments = await operationEmployeeRepository.listOverlappingForOperationInDateRange(
      companyId,
      operationId,
      rangeStart,
      rangeEnd,
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

    const enabledShiftDates = new Set<string>();
    const referenceAt = new Date();
    const shiftById = new Map<string, OperationShift>(
      activeShifts.map((shift) => [shift.id, shift]),
    );

    for (const workDate of iterateDateIsoRange(rangeStart, rangeEnd)) {
      for (const shift of activeShifts) {
        const versions = versionsByShiftId.get(shift.id) ?? [];
        const version = resolveVersionForDate(versions, workDate);
        if (!version) {
          continue;
        }
        if (!isDayEnabled(version, workDate, timezone)) {
          const key = workdayShiftKey(workDate, shift.id);
          const existing = existingByShiftDate.get(key);
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
              existingByShiftDate.set(key, {
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

        const exception =
          exceptionByShiftDate.get(workdayShiftKey(workDate, shift.id)) ?? null;
        const schedule = resolveShiftScheduleForDate({
          version,
          exception,
          workDate,
          timezone,
        });

        const key = workdayShiftKey(workDate, shift.id);
        const needsAtomicReconcile =
          schedule.cancelled ||
          exception?.exceptionKind === "RESTORE" ||
          exception?.exceptionKind === "CANCEL";

        if (needsAtomicReconcile) {
          const pool = getPool();
          const transaction = new sql.Transaction(pool);
          await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
          try {
            const reconciled = await reconcileShiftWorkdayInTransaction(companyId, transaction, {
              operationId,
              operationShiftId: shift.id,
              workDate,
              operation,
              shift,
              versions,
              exception,
              timezone,
            });
            await transaction.commit();
            if (reconciled) {
              existingByShiftDate.set(key, reconciled);
              if (reconciled.status === "CANCELLED") {
                counters.operationWorkdaysCancelled += 1;
              } else if (reconciled.status === "ACTIVE") {
                enabledShiftDates.add(key);
                if (!employeeWorkdayIndex.has(reconciled.id)) {
                  employeeWorkdayIndex.set(reconciled.id, new Map());
                }
                const activeAssignments = resolveActiveAssignmentsForWorkDate(assignments, workDate, {
                  operationShiftId: shift.id,
                });
                await reconcileEmployeeExpectationsForWorkday(
                  companyId,
                  reconciled,
                  activeAssignments,
                  employeeWorkdayIndex.get(reconciled.id)!,
                  attendanceEmployeeWorkdayIds,
                  counters,
                );
              }
            }
          } catch (error) {
            try {
              await transaction.rollback();
            } catch {
              // already aborted
            }
            throw error;
          }
          continue;
        }

        enabledShiftDates.add(key);
        const snapshot = buildMultiShiftWorkdaySnapshot({
          workDate,
          shift,
          version,
          schedule,
          earlyToleranceMinutes: operation.earlyToleranceMinutes,
          lateToleranceMinutes: operation.lateToleranceMinutes,
          timezone,
        });

        const operationWorkday = await ensureMultiShiftOperationWorkdayRow(
          companyId,
          operationId,
          snapshot,
          existingByShiftDate,
          attendanceWorkdayIds,
          counters,
        );
        if (!operationWorkday) {
          continue;
        }

        if (!employeeWorkdayIndex.has(operationWorkday.id)) {
          employeeWorkdayIndex.set(operationWorkday.id, new Map());
        }

        const activeAssignments = resolveActiveAssignmentsForWorkDate(assignments, workDate, {
          operationShiftId: shift.id,
        });
        await reconcileEmployeeExpectationsForWorkday(
          companyId,
          operationWorkday,
          activeAssignments,
          employeeWorkdayIndex.get(operationWorkday.id)!,
          attendanceEmployeeWorkdayIds,
          counters,
        );
      }
    }

    for (const workday of existingWorkdays) {
      if (!workday.operationShiftId || workday.status !== "ACTIVE") {
        continue;
      }
      if (!shiftById.has(workday.operationShiftId)) {
        // Inactive shift identity: cancel future mutable like schedule disable.
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
        continue;
      }
      const key = workdayShiftKey(workday.workDate, workday.operationShiftId);
      if (enabledShiftDates.has(key)) {
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

    if (operation.scheduleMode === "MULTI_SHIFT") {
      return this.materializeMultiShiftOperationHorizon(companyId, operationId);
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

  /**
   * Restores workdays/expectations cancelled by operation cancel (reason OPERATION),
   * then rematerializes the horizon so assignments realign. Does not recreate history
   * or restart cancelled jobs.
   */
  async reconcileWorkdaysForReactivatedOperation(
    companyId: string,
    operationId: string,
  ): Promise<MaterializationResult> {
    const cancelledWorkdays = await operationWorkdayRepository.listOperationCancelledByOperation(
      companyId,
      operationId,
    );

    const counters = emptyMaterializationResult(operationId, "", "");

    for (const workday of cancelledWorkdays) {
      const reactivated = await operationWorkdayRepository.reactivateOperationCancelledWorkday(
        companyId,
        workday.id,
      );
      if (!reactivated) {
        continue;
      }

      counters.operationWorkdaysCreated += 1;
      const reactivatedEmployees =
        await employeeWorkdayRepository.reactivateOperationCancelledForWorkday(
          companyId,
          workday.id,
        );
      counters.employeeWorkdaysCreated += reactivatedEmployees;
    }

    const materializeResult = await this.materializeOperationHorizon(companyId, operationId);
    return {
      ...materializeResult,
      operationWorkdaysCreated:
        materializeResult.operationWorkdaysCreated + counters.operationWorkdaysCreated,
      employeeWorkdaysCreated:
        materializeResult.employeeWorkdaysCreated + counters.employeeWorkdaysCreated,
    };
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

  async reconcileCompanyToleranceOperations(
    companyId: string,
    changed: { early: boolean; late: boolean },
  ): Promise<CompanyMaterializationSummary> {
    const operations = await operationRepository.listRecurringIdsDependingOnCompanyTolerances(
      companyId,
      changed,
    );
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
        console.error("[recurring-workday-materialization] company tolerance sync failed", {
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
