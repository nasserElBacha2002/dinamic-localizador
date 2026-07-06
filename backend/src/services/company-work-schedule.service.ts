import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { companyWorkScheduleRepository } from "../repositories/company-work-schedule.repository";
import type { CompanyWorkSchedule, WeeklyScheduleDay } from "../types/schedule";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import {
  normalizeWeeklyScheduleDays,
  validateWeeklyScheduleDays,
  weeklySchedulesEqual,
} from "../utils/weekly-schedule";

export const companyWorkScheduleService = {
  async getByCompanyId(companyId: string): Promise<CompanyWorkSchedule> {
    const existing = await companyWorkScheduleRepository.findByCompanyId(companyId);
    if (existing) {
      return existing;
    }

    throw new AppError(
      404,
      "COMPANY_WORK_SCHEDULE_NOT_FOUND",
      "La empresa no tiene un horario laboral semanal configurado",
    );
  },

  async update(
    companyId: string,
    input: { timezone: string; days: WeeklyScheduleDay[] },
  ): Promise<CompanyWorkSchedule> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    if (!settings) {
      throw new AppError(404, "COMPANY_SETTINGS_NOT_FOUND", "Configuración de empresa no encontrada");
    }

    const normalizedDays = normalizeWeeklyScheduleDays(input.days);
    const validation = validateWeeklyScheduleDays(normalizedDays);
    if (!validation.valid) {
      throw new AppError(400, validation.code, validation.message);
    }

    const timezone = resolveOperationTimezone(input.timezone);
    const current = await companyWorkScheduleRepository.findByCompanyId(companyId);
    const normalizedCurrentDays = current ? normalizeWeeklyScheduleDays(current.days) : null;

    if (
      current &&
      current.timezone === timezone &&
      normalizedCurrentDays &&
      weeklySchedulesEqual(normalizedCurrentDays, normalizedDays)
    ) {
      return current;
    }

    const nextVersion = (current?.version ?? 0) + 1;

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const updated = await companyWorkScheduleRepository.replaceInTransaction(companyId, transaction, {
        timezone,
        days: normalizedDays,
        nextVersion,
      });
      await transaction.commit();
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
