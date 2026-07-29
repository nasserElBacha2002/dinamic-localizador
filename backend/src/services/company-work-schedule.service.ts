import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { companyWorkScheduleRepository } from "../repositories/company-work-schedule.repository";
import type { CompanyWorkSchedule, WeeklyScheduleDay } from "../types/schedule";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import {
  createDefaultWeeklyScheduleDays,
  normalizeWeeklyScheduleDays,
  validateWeeklyScheduleDays,
  weeklySchedulesEqual,
} from "../utils/weekly-schedule";
import { recurringWorkdayMaterializationService } from "./recurring-workday-materialization.service";
import { recurringWorkdaySyncService } from "./recurring-workday-sync.service";

export const companyWorkScheduleService = {
  async ensureDefaultForCompany(
    companyId: string,
    timezone: string,
    transaction?: sql.Transaction,
  ): Promise<CompanyWorkSchedule> {
    const existing = transaction
      ? await companyWorkScheduleRepository.findByCompanyIdInTransaction(companyId, transaction)
      : await companyWorkScheduleRepository.findByCompanyId(companyId);
    if (existing) {
      return existing;
    }

    const days = normalizeWeeklyScheduleDays(createDefaultWeeklyScheduleDays());
    const validation = validateWeeklyScheduleDays(days);
    if (!validation.valid) {
      throw new AppError(400, validation.code, validation.message);
    }

    if (transaction) {
      return companyWorkScheduleRepository.replaceInTransaction(companyId, transaction, {
        timezone: resolveOperationTimezone(timezone),
        days,
        nextVersion: 1,
      });
    }

    const pool = getPool();
    const localTransaction = new sql.Transaction(pool);
    await localTransaction.begin();
    try {
      const created = await companyWorkScheduleRepository.replaceInTransaction(
        companyId,
        localTransaction,
        {
          timezone: resolveOperationTimezone(timezone),
          days,
          nextVersion: 1,
        },
      );
      await localTransaction.commit();
      return created;
    } catch (error) {
      try {
        await localTransaction.rollback();
      } catch {
        // ignore
      }
      throw error;
    }
  },

  async getByCompanyId(companyId: string): Promise<CompanyWorkSchedule> {
    const existing = await companyWorkScheduleRepository.findByCompanyId(companyId);
    if (existing) {
      return existing;
    }

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    return this.ensureDefaultForCompany(companyId, timezone);
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

      const summary = await recurringWorkdayMaterializationService.reconcileCompanyScheduleOperations(
        companyId,
      );
      recurringWorkdaySyncService.assertCompanySyncSucceeded(summary);

      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
