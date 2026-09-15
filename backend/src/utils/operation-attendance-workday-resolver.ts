import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { Operation } from "../types/domain";
import { AppError } from "../errors/app-error";
import { getDateIsoInTimezone } from "./absence-date";
import { resolveOperationTimezone } from "./operation-timezone";

export interface ResolvedAttendanceWorkday {
  operationWorkdayId: string;
  workDate: string;
  operationShiftId: string | null;
  shiftNameSnapshot: string | null;
}

/**
 * Resolves which operation_workday the attendance summary should use.
 *
 * SINGLE: ONE_TIME uses the sole workday; RECURRING defaults to today.
 * MULTI_SHIFT: never picks TOP 1 — requires workdayId, or a workDate with exactly one shift row.
 */
export async function resolveAttendanceSummaryWorkday(
  companyId: string,
  operationId: string,
  operation: Operation,
  input: { workDate?: string; workdayId?: string },
): Promise<ResolvedAttendanceWorkday | null> {
  if (input.workdayId) {
    const workday = await operationWorkdayRepository.findById(companyId, input.workdayId);
    if (!workday || workday.operationId !== operationId) {
      return null;
    }
    return {
      operationWorkdayId: workday.id,
      workDate: workday.workDate,
      operationShiftId: workday.operationShiftId,
      shiftNameSnapshot: workday.shiftNameSnapshot,
    };
  }

  if (operation.scheduleMode === "MULTI_SHIFT") {
    if (!input.workDate) {
      throw new AppError(
        400,
        "MULTI_SHIFT_ATTENDANCE_SUMMARY_REQUIRES_WORKDAY",
        "Para operaciones multi-turno indicá workdayId (o workDate con un único turno).",
      );
    }
    const rows = await operationWorkdayRepository.listByOperationAndWorkDate(
      companyId,
      operationId,
      input.workDate,
    );
    if (rows.length === 0) {
      return null;
    }
    if (rows.length > 1) {
      throw new AppError(
        400,
        "MULTI_SHIFT_ATTENDANCE_SUMMARY_AMBIGUOUS",
        "Hay varios turnos en esa fecha; indicá workdayId del turno.",
      );
    }
    const workday = rows[0]!;
    return {
      operationWorkdayId: workday.id,
      workDate: workday.workDate,
      operationShiftId: workday.operationShiftId,
      shiftNameSnapshot: workday.shiftNameSnapshot,
    };
  }

  if (input.workDate) {
    const workday = await operationWorkdayRepository.findByOperationAndWorkDate(
      companyId,
      operationId,
      input.workDate,
    );
    if (!workday) {
      return null;
    }
    return {
      operationWorkdayId: workday.id,
      workDate: workday.workDate,
      operationShiftId: workday.operationShiftId,
      shiftNameSnapshot: workday.shiftNameSnapshot,
    };
  }

  const operationKind = operation.operationKind ?? "ONE_TIME";

  if (operationKind === "RECURRING") {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    const today = getDateIsoInTimezone(new Date(), timezone);
    const workday = await operationWorkdayRepository.findByOperationAndWorkDate(
      companyId,
      operationId,
      today,
    );
    if (!workday) {
      return null;
    }
    return {
      operationWorkdayId: workday.id,
      workDate: workday.workDate,
      operationShiftId: workday.operationShiftId,
      shiftNameSnapshot: workday.shiftNameSnapshot,
    };
  }

  const workdays = await operationWorkdayRepository.listByOperationId(companyId, operationId);
  const workday = workdays[0];
  if (!workday) {
    return null;
  }
  return {
    operationWorkdayId: workday.id,
    workDate: workday.workDate,
    operationShiftId: workday.operationShiftId,
    shiftNameSnapshot: workday.shiftNameSnapshot,
  };
}
