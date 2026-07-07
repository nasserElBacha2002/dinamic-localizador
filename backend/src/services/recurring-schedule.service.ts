import { AppError } from "../errors/app-error";
import { companyWorkScheduleRepository } from "../repositories/company-work-schedule.repository";
import type {
  CompanyWorkSchedule,
  EffectiveRecurringSchedule,
  OperationSchedule,
  ResolvedScheduleDay,
} from "../types/schedule";
import {
  assertCompanyWorkScheduleExists,
  assertRecurringScheduleConsistency,
} from "../utils/recurring-schedule-consistency";
import { recurringScheduleResolver } from "../utils/recurring-schedule-resolver";
import { normalizeWeeklyScheduleDays } from "../utils/weekly-schedule";

const assertScheduleCoversWorkDate = (
  schedule: Pick<OperationSchedule, "validFrom" | "validUntil">,
  workDate: string,
): void => {
  if (workDate < schedule.validFrom) {
    throw new AppError(
      409,
      "OPERATION_SCHEDULE_NOT_ACTIVE",
      "La operación no está vigente en la fecha indicada",
    );
  }
  if (schedule.validUntil && workDate > schedule.validUntil) {
    throw new AppError(
      409,
      "OPERATION_SCHEDULE_NOT_ACTIVE",
      "La operación no está vigente en la fecha indicada",
    );
  }
};

export const recurringScheduleService = {
  async resolveEffectiveSchedule(
    companyId: string,
    operationSchedule: OperationSchedule,
    companySchedule?: CompanyWorkSchedule | null,
  ): Promise<EffectiveRecurringSchedule> {
    if (operationSchedule.scheduleSource === "CUSTOM") {
      if (!operationSchedule.timezone) {
        throw new AppError(
          409,
          "RECURRING_SCHEDULE_DATA_INCONSISTENT",
          "La operación habitual requiere zona horaria para horario específico",
        );
      }

      return {
        scheduleSource: "CUSTOM",
        timezone: operationSchedule.timezone,
        version: operationSchedule.version,
        days: normalizeWeeklyScheduleDays(operationSchedule.days),
      };
    }

    const resolvedCompanySchedule =
      companySchedule ?? (await companyWorkScheduleRepository.findByCompanyId(companyId));
    const companyWorkSchedule = assertCompanyWorkScheduleExists(resolvedCompanySchedule);

    return {
      scheduleSource: "COMPANY",
      timezone: companyWorkSchedule.timezone,
      version: companyWorkSchedule.version,
      days: normalizeWeeklyScheduleDays(companyWorkSchedule.days),
    };
  },

  async resolveForWorkDate(
    companyId: string,
    operationSchedule: OperationSchedule,
    workDate: string,
    companySchedule?: CompanyWorkSchedule | null,
  ): Promise<ResolvedScheduleDay> {
    assertScheduleCoversWorkDate(operationSchedule, workDate);
    const effectiveSchedule = await this.resolveEffectiveSchedule(
      companyId,
      operationSchedule,
      companySchedule,
    );

    return recurringScheduleResolver.resolveDay(workDate, effectiveSchedule);
  },

  async getOperationScheduleOrThrow(
    companyId: string,
    operationId: string,
  ): Promise<OperationSchedule> {
    const { operationScheduleRepository } = await import(
      "../repositories/operation-schedule.repository"
    );
    const schedule = await operationScheduleRepository.findByOperationId(companyId, operationId);
    if (!schedule) {
      throw new AppError(404, "OPERATION_SCHEDULE_NOT_FOUND", "La operación no tiene horario configurado");
    }
    return schedule;
  },

  buildDisplaySchedule(
    operationSchedule: OperationSchedule,
    effectiveSchedule: EffectiveRecurringSchedule,
  ) {
    return {
      scheduleSource: effectiveSchedule.scheduleSource,
      validFrom: operationSchedule.validFrom,
      validUntil: operationSchedule.validUntil,
      timezone: effectiveSchedule.timezone,
      version: effectiveSchedule.version,
      days: effectiveSchedule.days,
    };
  },

  assertScheduleConsistency(
    operationId: string,
    schedule: OperationSchedule,
    companySchedule: CompanyWorkSchedule | null | undefined,
  ): void {
    assertRecurringScheduleConsistency(operationId, schedule, companySchedule);
  },
};
