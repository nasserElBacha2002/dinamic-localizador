import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { Operation } from "../types/domain";
import { getDateIsoInTimezone } from "./absence-date";
import { resolveOperationTimezone } from "./operation-timezone";

export interface ResolvedAttendanceWorkday {
  operationWorkdayId: string;
  workDate: string;
}

/**
 * Resolves which operation_workday the attendance summary should use.
 *
 * RECURRING defaults to today's materialized workday in the company operational
 * timezone — never the first/earliest workday of the operation.
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
    return { operationWorkdayId: workday.id, workDate: workday.workDate };
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
    return { operationWorkdayId: workday.id, workDate: workday.workDate };
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
    return { operationWorkdayId: workday.id, workDate: workday.workDate };
  }

  const workdays = await operationWorkdayRepository.listByOperationId(companyId, operationId);
  const workday = workdays[0];
  if (!workday) {
    return null;
  }
  return { operationWorkdayId: workday.id, workDate: workday.workDate };
}
