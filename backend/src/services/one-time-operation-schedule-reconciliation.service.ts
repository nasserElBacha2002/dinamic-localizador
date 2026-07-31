import sql from "mssql";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { attendanceNotificationRepository } from "../repositories/attendance-notification.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { Operation } from "../types/domain";
import type { OperationWorkday } from "../types/workday";
import type { OneTimeScheduleChangeImpact } from "../utils/one-time-schedule-change";
import { resolveNextWorkdayScheduleVersion } from "../utils/one-time-schedule-change";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { operationWorkdayResolver } from "./operation-workday-resolver";
import {
  oneTimeScheduleConsistencyInspector,
  type OneTimeScheduleConsistencyReport,
} from "./one-time-schedule-consistency.inspector";

export type OneTimeScheduleReconciliationResult = {
  operationWorkdayId: string | null;
  workDate: string | null;
  scheduleVersion: number | null;
  assignmentsUpdated: number;
  confirmationsReset: number;
  notificationsSuperseded: number;
  /** @deprecated alias of notificationsSuperseded */
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
 * Mutating command: reconciles ONE_TIME derived entities inside the caller's
 * transaction. Lock order: scheduled_operations (caller) → operation_workdays →
 * operation_assignments → employee_workdays → notifications → audit (caller).
 *
 * Reminder schedule_version bumps only when impact.reminderScheduleChanged.
 */
export const oneTimeScheduleReconciliationCommand = {
  async reconcileInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operation: Operation,
    impact: OneTimeScheduleChangeImpact,
  ): Promise<OneTimeScheduleReconciliationResult> {
    if (!impact.scheduleAffecting) {
      return {
        operationWorkdayId: null,
        workDate: null,
        scheduleVersion: null,
        assignmentsUpdated: 0,
        confirmationsReset: 0,
        notificationsSuperseded: 0,
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
        const expectedScheduleVersion = workday.scheduleVersion;
        const nextScheduleVersion = resolveNextWorkdayScheduleVersion(
          expectedScheduleVersion,
          impact,
        );
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
            expectedScheduleVersion,
            nextScheduleVersion,
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
    let notificationsSuperseded = 0;
    let employeeWorkdaysEnsured = 0;

    if (impact.timingChanged || workdayAction === "created" || workdayAction === "updated") {
      assignmentsUpdated =
        await operationEmployeeRepository.updateActiveValidityForOperationInTransaction(
          companyId,
          transaction,
          operation.id,
          resolved.workDate,
        );
    }

    if (impact.confirmationScheduleChanged) {
      confirmationsReset =
        await employeeAssignmentQueryRepository.resetConfirmationsForOperationScheduleChange(
          companyId,
          operation.id,
          transaction,
        );
    }

    if (impact.reminderScheduleChanged) {
      notificationsSuperseded =
        await attendanceNotificationRepository.supersedePendingForOperationScheduleChange(
          companyId,
          operation.id,
          transaction,
        );
    }

    if (workday) {
      employeeWorkdaysEnsured =
        await employeeWorkdayRepository.insertMissingForActiveAssignmentsInTransaction(
          companyId,
          transaction,
          {
            operationId: operation.id,
            operationWorkdayId: workday.id,
            workDate: resolved.workDate,
          },
        );
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
      notificationsSuperseded,
      employeeWorkdaysEnsured,
      timingChanged: impact.timingChanged,
      toleranceChanged: impact.toleranceChanged,
      reminderScheduleChanged: impact.reminderScheduleChanged,
      confirmationScheduleChanged: impact.confirmationScheduleChanged,
    });

    return {
      operationWorkdayId: workday?.id ?? null,
      workDate: resolved.workDate,
      scheduleVersion,
      assignmentsUpdated,
      confirmationsReset,
      notificationsSuperseded,
      notificationsInvalidated: notificationsSuperseded,
      employeeWorkdaysEnsured,
      workdayAction,
    };
  },
};

/** @deprecated Prefer oneTimeScheduleReconciliationCommand */
export const oneTimeOperationScheduleReconciliationService = {
  reconcileInTransaction:
    oneTimeScheduleReconciliationCommand.reconcileInTransaction.bind(
      oneTimeScheduleReconciliationCommand,
    ),

  async repairFromCurrentSchedule(
    companyId: string,
    operationId: string,
    options?: { apply?: boolean },
  ): Promise<{
    dryRun: boolean;
    status: OneTimeScheduleConsistencyReport["status"];
    report: OneTimeScheduleConsistencyReport;
    result?: OneTimeScheduleReconciliationResult;
  }> {
    return oneTimeScheduleRepairService.repairFromCurrentSchedule(companyId, operationId, options);
  },
};

export const oneTimeScheduleRepairService = {
  async repairFromCurrentSchedule(
    companyId: string,
    operationId: string,
    options?: { apply?: boolean },
  ): Promise<{
    dryRun: boolean;
    status: OneTimeScheduleConsistencyReport["status"];
    report: OneTimeScheduleConsistencyReport;
    result?: OneTimeScheduleReconciliationResult;
  }> {
    const report = await oneTimeScheduleConsistencyInspector.inspect(companyId, operationId);
    const dryRun = !options?.apply;

    if (report.status !== "repairable") {
      return { dryRun, status: report.status, report };
    }

    if (dryRun) {
      return { dryRun: true, status: "repairable", report };
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

      const result = await oneTimeScheduleReconciliationCommand.reconcileInTransaction(
        companyId,
        transaction,
        locked,
        {
          timingChanged: true,
          toleranceChanged: true,
          workdaySnapshotChanged: true,
          confirmationScheduleChanged: true,
          reminderScheduleChanged: true,
          scheduleAffecting: true,
        },
      );
      await transaction.commit();
      return { dryRun: false, status: "repairable", report, result };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
