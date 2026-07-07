import { AppError } from "../errors/app-error";
import type {
  CompanyWorkSchedule,
  OperationSchedule,
  WeeklyScheduleDay,
} from "../types/schedule";
import { validateWeeklyScheduleDays } from "./weekly-schedule";

export const assertCompanyWorkScheduleExists = (
  companySchedule: CompanyWorkSchedule | null | undefined,
): CompanyWorkSchedule => {
  if (!companySchedule) {
    throw new AppError(
      404,
      "COMPANY_WORK_SCHEDULE_NOT_FOUND",
      "La empresa no tiene un horario laboral semanal configurado",
    );
  }
  return companySchedule;
};

export const assertRecurringOperationScheduleExists = (
  operationId: string,
  schedule: OperationSchedule | null | undefined,
): OperationSchedule => {
  if (!schedule) {
    throw new AppError(
      409,
      "RECURRING_SCHEDULE_DATA_INCONSISTENT",
      `La operación habitual ${operationId} no tiene configuración de horario`,
    );
  }
  return schedule;
};

export const assertCustomScheduleDays = (days: WeeklyScheduleDay[]): void => {
  const validation = validateWeeklyScheduleDays(days);
  if (!validation.valid) {
    throw new AppError(400, validation.code, validation.message);
  }
};

export const assertRecurringScheduleConsistency = (
  operationId: string,
  schedule: OperationSchedule,
  companySchedule: CompanyWorkSchedule | null | undefined,
): void => {
  if (schedule.scheduleSource === "COMPANY") {
    assertCompanyWorkScheduleExists(companySchedule);
    return;
  }

  assertCustomScheduleDays(schedule.days);
  if (schedule.timezone === null) {
    throw new AppError(
      409,
      "RECURRING_SCHEDULE_DATA_INCONSISTENT",
      `La operación habitual ${operationId} requiere zona horaria para horario específico`,
    );
  }
};
