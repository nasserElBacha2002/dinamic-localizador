import sql from "mssql";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { attendanceNotificationRepository } from "../repositories/attendance-notification.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { Operation } from "../types/domain";
import type { OperationWorkday } from "../types/workday";
import type { OneTimeScheduleChangeFlags } from "../utils/one-time-schedule-change";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { operationWorkdayResolver } from "./operation-workday-resolver";
import { workdayMaterializationService } from "./workday-materialization.service";

export type OneTimeScheduleReconciliationResult = {
  operationWorkdayId: string | null;
  workDate: string | null;
  scheduleVersion: number | null;
  assignmentsUpdated: number;
  confirmationsReset: number;
  notificationsInvalidated: number;
  employeeWorkdaysEnsured: number;
  workdayAction: "updated" | "created" | "unchanged" | "none";
};

const assertOneTimeWorkdayInvariant = (operationId: string, workdays: OperationWorkday[]): void => {
  if (workdays.length > 1) {
    throw new AppError(
      409,
      "ONE_TIME_OPERATION_MULTIPLE_WORKDAYS",
      `La operación ONE_TIME ${operationId} tiene múltiples jornadas materializadas; no se puede reconciliar de forma segura`,
    );
  }
};

const sameInstant = (left: string | null | undefined, right: Date | null): boolean => {
  if (left == null && right == null) {
    return true;
  }
  if (left == null || right == null) {
    return false;
  }
  return new Date(left).getTime() === right.getTime();
};

const workdayAlreadyMatches = (
  workday: OperationWorkday,
  resolved: {
    workDate: string;
    expectedStartAt: Date;
    expectedEndAt: Date | null;
    earlyToleranceMinutes: number;
    lateToleranceMinutes: number;
    timezone: string;
  },
): boolean =>
  workday.workDate === resolved.workDate &&
  sameInstant(workday.expectedStartAt, resolved.expectedStartAt) &&
  sameInstant(workday.expectedEndAt, resolved.expectedEndAt) &&
  workday.earlyToleranceMinutes === resolved.earlyToleranceMinutes &&
  workday.lateToleranceMinutes === resolved.lateToleranceMinutes &&
  (workday.scheduleTimezoneSnapshot ?? resolved.timezone) === resolved.timezone &&
  workday.status === "ACTIVE";

/**
 * Reconciles ONE_TIME derived entities after scheduled_operations was updated
 * inside the caller's transaction. Prefer in-place operation_workday updates so
 * employee_workdays keep their operation_workday_id.
 *
 * Historical attendance policy: reject timing/work-date changes when the
 * materialised workday already has attendance_records.
 */
export const oneTimeOperationScheduleReconciliationService = {
  async reconcileInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operation: Operation,
    flags: OneTimeScheduleChangeFlags,
  ): Promise<OneTimeScheduleReconciliationResult> {
    if (!flags.scheduleAffecting) {
      return {
        operationWorkdayId: null,
        workDate: null,
        scheduleVersion: null,
        assignmentsUpdated: 0,
        confirmationsReset: 0,
        notificationsInvalidated: 0,
        employeeWorkdaysEnsured: 0,
        workdayAction: "none",
      };
    }

    if ((operation.operationKind ?? "ONE_TIME") !== "ONE_TIME") {
      throw new AppError(
        400,
        "INVALID_OPERATION_KIND",
        "La reconciliación de horario solo aplica a operaciones ONE_TIME",
      );
    }

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    const resolved = operationWorkdayResolver.resolveOneTime(operation, timezone);

    const workdays = await operationWorkdayRepository.listByOperationIdInTransaction(
      companyId,
      transaction,
      operation.id,
    );
    assertOneTimeWorkdayInvariant(operation.id, workdays);

    let workday = workdays[0] ?? null;
    let workdayAction: OneTimeScheduleReconciliationResult["workdayAction"] = "none";
    let scheduleVersion: number | null = workday?.scheduleVersion ?? null;

    if (workday) {
      const hasAttendance = await operationWorkdayRepository.hasAttendanceForWorkdayInTransaction(
        companyId,
        transaction,
        workday.id,
      );

      const wouldChangeTimingOrDate =
        workday.workDate !== resolved.workDate ||
        !sameInstant(workday.expectedStartAt, resolved.expectedStartAt) ||
        !sameInstant(workday.expectedEndAt, resolved.expectedEndAt);

      if (hasAttendance && wouldChangeTimingOrDate) {
        throw new AppError(
          409,
          "OPERATION_SCHEDULE_LOCKED_BY_ATTENDANCE",
          "No se puede modificar el horario de una operación ONE_TIME que ya tiene asistencia registrada",
        );
      }

      if (workdayAlreadyMatches(workday, resolved)) {
        workdayAction = "unchanged";
        scheduleVersion = workday.scheduleVersion;
      } else {
        const nextVersion = workday.scheduleVersion + 1;
        const updated = await operationWorkdayRepository.updateWorkDateAndSnapshotInTransaction(
          companyId,
          transaction,
          workday.id,
          {
            workDate: resolved.workDate,
            expectedStartAt: resolved.expectedStartAt,
            expectedEndAt: resolved.expectedEndAt,
            earlyToleranceMinutes: resolved.earlyToleranceMinutes,
            lateToleranceMinutes: resolved.lateToleranceMinutes,
            scheduleVersion: nextVersion,
            scheduleTimezoneSnapshot: timezone,
            status: "ACTIVE",
          },
        );
        if (!updated) {
          throw new AppError(
            409,
            "OPERATION_WORKDAY_SCHEDULE_CONFLICT",
            "No se pudo actualizar la jornada materializada (conflicto de versión)",
          );
        }
        workday = updated;
        scheduleVersion = updated.scheduleVersion;
        workdayAction = "updated";
      }
    } else {
      const activeAssignments = await operationEmployeeRepository.listByOperationInTransaction(
        companyId,
        operation.id,
        transaction,
      );
      if (activeAssignments.length > 0) {
        workday = await operationWorkdayRepository.insertInTransaction(companyId, transaction, {
          operationId: operation.id,
          workDate: resolved.workDate,
          expectedStartAt: resolved.expectedStartAt,
          expectedEndAt: resolved.expectedEndAt,
          earlyToleranceMinutes: resolved.earlyToleranceMinutes,
          lateToleranceMinutes: resolved.lateToleranceMinutes,
          scheduleVersion: 1,
          scheduleTimezoneSnapshot: timezone,
        });
        scheduleVersion = workday.scheduleVersion;
        workdayAction = "created";
      }
    }

    let assignmentsUpdated = 0;
    let confirmationsReset = 0;
    let notificationsInvalidated = 0;
    let employeeWorkdaysEnsured = 0;

    if (flags.timingChanged || workdayAction === "created" || workdayAction === "updated") {
      assignmentsUpdated =
        await operationEmployeeRepository.updateActiveValidityForOperationInTransaction(
          companyId,
          transaction,
          operation.id,
          resolved.workDate,
        );
    }

    if (flags.timingChanged) {
      confirmationsReset =
        await employeeAssignmentQueryRepository.resetConfirmationsForOperationScheduleChange(
          companyId,
          operation.id,
          transaction,
        );
      notificationsInvalidated =
        await attendanceNotificationRepository.failPendingForOperationScheduleChange(
          companyId,
          operation.id,
          transaction,
        );
    }

    if (workday) {
      const assignments = await operationEmployeeRepository.listByOperationInTransaction(
        companyId,
        operation.id,
        transaction,
      );
      for (const assignment of assignments) {
        const ensured =
          await workdayMaterializationService.ensureEmployeeWorkdayForAssignmentInTransaction(
            companyId,
            transaction,
            operation.id,
            assignment.employeeId,
            assignment.id,
            resolved.workDate,
          );
        if (ensured) {
          employeeWorkdaysEnsured += 1;
        }
      }
    }

    console.info("[operation] one-time schedule reconciled", {
      companyId,
      operationId: operation.id,
      workdayAction,
      operationWorkdayId: workday?.id ?? null,
      workDate: resolved.workDate,
      scheduleVersion,
      assignmentsUpdated,
      confirmationsReset,
      notificationsInvalidated,
      employeeWorkdaysEnsured,
      timingChanged: flags.timingChanged,
      toleranceChanged: flags.toleranceChanged,
    });

    return {
      operationWorkdayId: workday?.id ?? null,
      workDate: resolved.workDate,
      scheduleVersion,
      assignmentsUpdated,
      confirmationsReset,
      notificationsInvalidated,
      employeeWorkdaysEnsured,
      workdayAction,
    };
  },

  /**
   * Repair path: treat current scheduled_operations as source of truth and
   * reconcile derived entities. Used by the dry-run/apply CLI (not on app boot).
   */
  async repairFromCurrentSchedule(
    companyId: string,
    operationId: string,
    options?: { apply?: boolean },
  ): Promise<{
    dryRun: boolean;
    status: "consistent" | "repairable" | "blocked" | "missing_operation" | "not_one_time";
    detail: Record<string, unknown>;
    result?: OneTimeScheduleReconciliationResult;
  }> {
    const operation = await operationRepository.findById(companyId, operationId);

    if (!operation) {
      return {
        dryRun: !options?.apply,
        status: "missing_operation",
        detail: { companyId, operationId },
      };
    }

    if ((operation.operationKind ?? "ONE_TIME") !== "ONE_TIME") {
      return {
        dryRun: !options?.apply,
        status: "not_one_time",
        detail: { companyId, operationId, operationKind: operation.operationKind },
      };
    }

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    const resolved = operationWorkdayResolver.resolveOneTime(operation, timezone);
    const workdays = await operationWorkdayRepository.listByOperationId(companyId, operationId);

    if (workdays.length > 1) {
      return {
        dryRun: !options?.apply,
        status: "blocked",
        detail: {
          reason: "ONE_TIME_OPERATION_MULTIPLE_WORKDAYS",
          workdayCount: workdays.length,
          workdayIds: workdays.map((row) => row.id),
        },
      };
    }

    const workday = workdays[0] ?? null;
    const assignments = await operationEmployeeRepository.listByOperation(companyId, operationId);
    const activeAssignments = assignments.filter((row) => !row.cancelledAt);
    const assignmentDrift = activeAssignments.filter(
      (row) => row.validFrom !== resolved.workDate || row.validUntil !== resolved.workDate,
    );

    // Lazy materialization is valid when there are no active assignments yet.
    const workdayDrift =
      (workday == null && activeAssignments.length > 0) ||
      (workday != null &&
        (workday.workDate !== resolved.workDate ||
          !sameInstant(workday.expectedStartAt, resolved.expectedStartAt) ||
          !sameInstant(workday.expectedEndAt, resolved.expectedEndAt) ||
          workday.earlyToleranceMinutes !== resolved.earlyToleranceMinutes ||
          workday.lateToleranceMinutes !== resolved.lateToleranceMinutes));

    if (!workdayDrift && assignmentDrift.length === 0) {
      return {
        dryRun: !options?.apply,
        status: "consistent",
        detail: {
          companyId,
          operationId,
          workDate: resolved.workDate,
          operationWorkdayId: workday?.id ?? null,
        },
      };
    }

    if (workday) {
      const hasAttendance = await operationWorkdayRepository.hasAttendanceForWorkday(
        companyId,
        workday.id,
      );
      const wouldChangeTimingOrDate =
        workday.workDate !== resolved.workDate ||
        !sameInstant(workday.expectedStartAt, resolved.expectedStartAt) ||
        !sameInstant(workday.expectedEndAt, resolved.expectedEndAt);
      if (hasAttendance && wouldChangeTimingOrDate) {
        return {
          dryRun: !options?.apply,
          status: "blocked",
          detail: {
            reason: "OPERATION_SCHEDULE_LOCKED_BY_ATTENDANCE",
            operationWorkdayId: workday.id,
            scheduledStart: operation.scheduledStart,
            workdayExpectedStartAt: workday.expectedStartAt,
            workDate: workday.workDate,
            resolvedWorkDate: resolved.workDate,
            assignmentDriftCount: assignmentDrift.length,
          },
        };
      }
    }

    const detail = {
      companyId,
      operationId,
      scheduledStart: operation.scheduledStart,
      scheduledEnd: operation.scheduledEnd,
      resolvedWorkDate: resolved.workDate,
      resolvedExpectedStartAt: resolved.expectedStartAt.toISOString(),
      resolvedExpectedEndAt: resolved.expectedEndAt?.toISOString() ?? null,
      currentWorkday: workday
        ? {
            id: workday.id,
            workDate: workday.workDate,
            expectedStartAt: workday.expectedStartAt,
            expectedEndAt: workday.expectedEndAt,
            scheduleVersion: workday.scheduleVersion,
          }
        : null,
      assignmentDrift: assignmentDrift.map((row) => ({
        assignmentId: row.id,
        employeeId: row.employeeId,
        validFrom: row.validFrom,
        validUntil: row.validUntil,
      })),
    };

    if (!options?.apply) {
      return { dryRun: true, status: "repairable", detail };
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const locked = await operationRepository.findByIdForUpdate(
        companyId,
        operationId,
        transaction,
      );
      if (!locked) {
        throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
      }

      const result = await this.reconcileInTransaction(companyId, transaction, locked, {
        timingChanged: true,
        toleranceChanged: true,
        scheduleAffecting: true,
      });
      await transaction.commit();
      return { dryRun: false, status: "repairable", detail, result };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
