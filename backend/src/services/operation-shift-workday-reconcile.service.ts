import sql from "mssql";
import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationShiftExceptionRepository } from "../repositories/operation-shift-exception.repository";
import { operationShiftRepository } from "../repositories/operation-shift.repository";
import { operationShiftVersionRepository } from "../repositories/operation-shift-version.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { Operation } from "../types/domain";
import type {
  OperationShift,
  OperationShiftDateException,
  OperationShiftVersion,
} from "../types/operation-shift";
import type { OperationWorkday } from "../types/workday";
import {
  isDayEnabled,
  resolveShiftScheduleForDate,
  resolveVersionForDate,
} from "../utils/operation-shift-version-resolver";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { buildMultiShiftWorkdaySnapshot } from "./multi-shift-workday-snapshot";

export type ReconcileShiftWorkdayInput = {
  operationId: string;
  operationShiftId: string;
  workDate: string;
  /** Optional preloaded entities to avoid extra round-trips inside the TX. */
  operation?: Operation;
  shift?: OperationShift;
  versions?: OperationShiftVersion[];
  exception?: OperationShiftDateException | null;
  timezone?: string;
};

/** RESTORE may reactivate only CANCELLED/EXCEPTION workdays that have not started and have no attendance. */
export const isMutableForExceptionRestore = (
  workday: Pick<OperationWorkday, "status" | "cancellationReason" | "expectedStartAt">,
  hasAttendance: boolean,
  referenceAt: Date,
): boolean => {
  if (workday.status !== "CANCELLED" || workday.cancellationReason !== "EXCEPTION") {
    return false;
  }
  if (new Date(workday.expectedStartAt) <= referenceAt) {
    return false;
  }
  return !hasAttendance;
};

/**
 * Atomic single-shift workday reconcile (CANCEL / RESTORE / TIME_OVERRIDE / schedule).
 * Must run inside an existing SERIALIZABLE (or equivalent) transaction.
 */
export const reconcileShiftWorkdayInTransaction = async (
  companyId: string,
  transaction: sql.Transaction,
  input: ReconcileShiftWorkdayInput,
): Promise<OperationWorkday | null> => {
  const operation =
    input.operation ??
    (await operationRepository.findById(companyId, input.operationId));
  if (!operation) {
    throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
  }
  if (operation.scheduleMode !== "MULTI_SHIFT") {
    throw new AppError(
      409,
      "OPERATION_NOT_MULTI_SHIFT",
      "Esta reconciliación solo aplica a operaciones multi-turno",
    );
  }

  const shift =
    input.shift ??
    (await operationShiftRepository.findByIdForOperation(
      companyId,
      input.operationId,
      input.operationShiftId,
    ));
  if (!shift) {
    throw new AppError(404, "OPERATION_SHIFT_NOT_FOUND", "Turno de operación no encontrado.");
  }

  const versions =
    input.versions ??
    (await operationShiftVersionRepository.listByShiftId(companyId, input.operationShiftId));
  const version = resolveVersionForDate(versions, input.workDate);

  const timezone =
    input.timezone ??
    resolveOperationTimezone(
      (await companySettingsRepository.findByCompanyId(companyId))?.operationTimezone,
    );

  const exception =
    input.exception !== undefined
      ? input.exception
      : await operationShiftExceptionRepository.findByShiftAndDateInTransaction(
          companyId,
          transaction,
          input.operationShiftId,
          input.workDate,
        );

  const workday = await operationWorkdayRepository.findByOperationWorkDateAndShiftInTransaction(
    companyId,
    transaction,
    input.operationId,
    input.workDate,
    input.operationShiftId,
  );

  const dayDisabled = version ? !isDayEnabled(version, input.workDate, timezone) : true;
  const schedule = version
    ? resolveShiftScheduleForDate({
        version,
        exception,
        workDate: input.workDate,
        timezone,
      })
    : null;

  const shouldCancel =
    !version || dayDisabled || (schedule?.cancelled ?? false);
  const cancelReason: "EXCEPTION" | "SCHEDULE" =
    schedule?.cancelled ? "EXCEPTION" : "SCHEDULE";

  if (shouldCancel) {
    if (!workday) {
      return null;
    }

    if (workday.status === "CANCELLED") {
      // Idempotent: still reconcile EXPECTED → cancelled for matching reason.
      await employeeWorkdayRepository.cancelExpectedForWorkdayInTransaction(
        companyId,
        transaction,
        workday.id,
        workday.cancellationReason === "EXCEPTION" ? "EXCEPTION" : "SCHEDULE",
      );
      return workday;
    }

    const cancelled = await operationWorkdayRepository.cancelWorkdayInTransaction(
      companyId,
      transaction,
      workday.id,
      cancelReason,
    );
    await employeeWorkdayRepository.cancelExpectedForWorkdayInTransaction(
      companyId,
      transaction,
      cancelled.id,
      cancelReason,
    );
    return cancelled;
  }

  // Active schedule / RESTORE / TIME_OVERRIDE path
  const snapshot = buildMultiShiftWorkdaySnapshot({
    workDate: input.workDate,
    shift,
    version: version!,
    schedule: schedule!,
    earlyToleranceMinutes: operation.earlyToleranceMinutes,
    lateToleranceMinutes: operation.lateToleranceMinutes,
    timezone,
  });

  let current = workday;
  const referenceAt = new Date();

  if (!current) {
    current = await operationWorkdayRepository.insertInTransaction(companyId, transaction, {
      operationId: input.operationId,
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
      status: "ACTIVE",
    });
  } else if (
    current.status === "CANCELLED" &&
    current.cancellationReason === "EXCEPTION"
  ) {
    const employeeRows =
      await employeeWorkdayRepository.listByOperationWorkdayIdInTransaction(
        companyId,
        transaction,
        current.id,
      );
    let hasAttendance = false;
    for (const row of employeeRows) {
      if (
        await employeeWorkdayRepository.hasAttendanceInTransaction(
          companyId,
          transaction,
          row.id,
        )
      ) {
        hasAttendance = true;
        break;
      }
    }

    if (!isMutableForExceptionRestore(current, hasAttendance, referenceAt)) {
      return current;
    }

    const reactivated = await operationWorkdayRepository.reactivateExceptionCancelledWorkday(
      companyId,
      current.id,
      {
        expectedStartAt: snapshot.expectedStartAt,
        expectedEndAt: snapshot.expectedEndAt,
        earlyToleranceMinutes: snapshot.earlyToleranceMinutes,
        lateToleranceMinutes: snapshot.lateToleranceMinutes,
        scheduleVersion: Math.max(current.scheduleVersion, snapshot.scheduleVersion),
        scheduleSourceSnapshot: snapshot.scheduleSourceSnapshot,
        scheduleTimezoneSnapshot: snapshot.scheduleTimezoneSnapshot,
        operationShiftVersionId: snapshot.operationShiftVersionId,
        shiftCodeSnapshot: snapshot.shiftCodeSnapshot,
        shiftNameSnapshot: snapshot.shiftNameSnapshot,
      },
      transaction,
    );
    if (!reactivated) {
      return current;
    }
    current = reactivated;

    // Restore EXCEPTION- and SCHEDULE-cancelled expectations for active assignments.
    await employeeWorkdayRepository.reactivateCancelledExpectationsForWorkdayInTransaction(
      companyId,
      transaction,
      current.id,
      ["EXCEPTION", "SCHEDULE"],
    );
  } else if (current.status === "CANCELLED" && current.cancellationReason === "SCHEDULE") {
    // Schedule rematerialization / RESTORE after day re-enabled.
    if (new Date(current.expectedStartAt) <= referenceAt) {
      return current;
    }
    const employeeRows =
      await employeeWorkdayRepository.listByOperationWorkdayIdInTransaction(
        companyId,
        transaction,
        current.id,
      );
    for (const row of employeeRows) {
      if (
        await employeeWorkdayRepository.hasAttendanceInTransaction(
          companyId,
          transaction,
          row.id,
        )
      ) {
        return current;
      }
    }

    const updated = await operationWorkdayRepository.updateMultiShiftSnapshotInTransaction(
      companyId,
      transaction,
      current.id,
      {
        expectedStartAt: snapshot.expectedStartAt,
        expectedEndAt: snapshot.expectedEndAt,
        earlyToleranceMinutes: snapshot.earlyToleranceMinutes,
        lateToleranceMinutes: snapshot.lateToleranceMinutes,
        scheduleVersion: Math.max(current.scheduleVersion + 1, snapshot.scheduleVersion),
        scheduleSourceSnapshot: snapshot.scheduleSourceSnapshot,
        scheduleTimezoneSnapshot: snapshot.scheduleTimezoneSnapshot,
        operationShiftVersionId: snapshot.operationShiftVersionId,
        shiftCodeSnapshot: snapshot.shiftCodeSnapshot,
        shiftNameSnapshot: snapshot.shiftNameSnapshot,
        status: "ACTIVE",
      },
    );
    if (!updated) {
      return current;
    }
    current = updated;
    await employeeWorkdayRepository.reactivateCancelledExpectationsForWorkdayInTransaction(
      companyId,
      transaction,
      current.id,
      ["SCHEDULE"],
    );
  } else if (current.status === "ACTIVE") {
    const nextVersion = Math.max(current.scheduleVersion + 1, snapshot.scheduleVersion);
    const updated = await operationWorkdayRepository.updateMultiShiftSnapshotInTransaction(
      companyId,
      transaction,
      current.id,
      {
        expectedStartAt: snapshot.expectedStartAt,
        expectedEndAt: snapshot.expectedEndAt,
        earlyToleranceMinutes: snapshot.earlyToleranceMinutes,
        lateToleranceMinutes: snapshot.lateToleranceMinutes,
        scheduleVersion: nextVersion,
        scheduleSourceSnapshot: snapshot.scheduleSourceSnapshot,
        scheduleTimezoneSnapshot: snapshot.scheduleTimezoneSnapshot,
        operationShiftVersionId: snapshot.operationShiftVersionId,
        shiftCodeSnapshot: snapshot.shiftCodeSnapshot,
        shiftNameSnapshot: snapshot.shiftNameSnapshot,
        status: "ACTIVE",
      },
    );
    if (updated) {
      current = updated;
    }
  }

  // Ensure EXPECTED rows for active shift assignments are handled by materializer /
  // assignment ensure paths; reconcile focuses on workday status + cancel/reactivate.
  return current;
};

export const operationShiftWorkdayReconcileService = {
  reconcileShiftWorkdayInTransaction,
};
