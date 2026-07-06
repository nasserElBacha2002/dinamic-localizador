import { AppError } from "../errors/app-error";
import { companyWorkScheduleRepository } from "../repositories/company-work-schedule.repository";
import { operationScheduleRepository } from "../repositories/operation-schedule.repository";
import type { OperationSchedule, ResolvedScheduleDay, WeeklyScheduleDay } from "../types/schedule";
import type { ScheduleSource } from "../constants/schedule-source";
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
  async resolveEffectiveDays(
    companyId: string,
    operationSchedule: OperationSchedule,
  ): Promise<WeeklyScheduleDay[]> {
    if (operationSchedule.scheduleSource === "CUSTOM") {
      return normalizeWeeklyScheduleDays(operationSchedule.days);
    }

    const companySchedule = await companyWorkScheduleRepository.findByCompanyId(companyId);
    if (!companySchedule) {
      throw new AppError(
        404,
        "COMPANY_WORK_SCHEDULE_NOT_FOUND",
        "La empresa no tiene un horario laboral semanal configurado",
      );
    }

    return normalizeWeeklyScheduleDays(companySchedule.days);
  },

  async resolveForWorkDate(
    companyId: string,
    operationSchedule: OperationSchedule,
    workDate: string,
  ): Promise<ResolvedScheduleDay> {
    assertScheduleCoversWorkDate(operationSchedule, workDate);
    const days = await this.resolveEffectiveDays(companyId, operationSchedule);
    const scheduleVersion =
      operationSchedule.scheduleSource === "COMPANY"
        ? (await companyWorkScheduleRepository.findByCompanyId(companyId))?.version ??
          operationSchedule.version
        : operationSchedule.version;

    return recurringScheduleResolver.resolveDay(workDate, {
      timezone: operationSchedule.timezone,
      scheduleSource: operationSchedule.scheduleSource,
      scheduleVersion,
      days,
    });
  },

  async getOperationScheduleOrThrow(
    companyId: string,
    operationId: string,
  ): Promise<OperationSchedule> {
    const schedule = await operationScheduleRepository.findByOperationId(companyId, operationId);
    if (!schedule) {
      throw new AppError(404, "OPERATION_SCHEDULE_NOT_FOUND", "La operación no tiene horario configurado");
    }
    return schedule;
  },

  buildDisplaySchedule(
    operationSchedule: OperationSchedule,
    effectiveDays: WeeklyScheduleDay[],
  ): {
    scheduleSource: ScheduleSource;
    validFrom: string;
    validUntil: string | null;
    timezone: string;
    version: number;
    days: WeeklyScheduleDay[];
  } {
    return {
      scheduleSource: operationSchedule.scheduleSource,
      validFrom: operationSchedule.validFrom,
      validUntil: operationSchedule.validUntil,
      timezone: operationSchedule.timezone,
      version: operationSchedule.version,
      days: effectiveDays,
    };
  },
};
