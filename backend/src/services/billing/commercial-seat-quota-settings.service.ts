import sql from "mssql";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import { companyRepository } from "../../repositories/companies/company.repository";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import type { UpdateCommercialSeatQuotaSettingsInput } from "../../schemas/commercial-seat-quota-settings.schema";
import { auditService } from "../audit.service";
import {
  parseCommercialSeatQuotaMode,
  resolveEffectiveCommercialSeatMode,
} from "../../utils/billing/resolve-effective-commercial-seat-mode";
import { commercialSeatQuotaService } from "./commercial-seat-quota.service";

export type CommercialSeatQuotaSettingsView = {
  companyId: string;
  globalMode: ReturnType<typeof commercialSeatQuotaService.getGlobalMode>;
  companyMode: "DISABLED" | "OBSERVE" | "ENFORCE" | null;
  effectiveMode: ReturnType<typeof commercialSeatQuotaService.getGlobalMode>;
};

export const commercialSeatQuotaSettingsService = {
  async getSettings(companyId: string): Promise<CommercialSeatQuotaSettingsView> {
    const company = await companyRepository.findById(companyId);
    if (!company) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    }
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const globalMode = commercialSeatQuotaService.getGlobalMode();
    const companyMode = parseCommercialSeatQuotaMode(settings?.commercialSeatQuotaMode ?? null);
    const effectiveMode = resolveEffectiveCommercialSeatMode(globalMode, companyMode);
    return {
      companyId,
      globalMode,
      companyMode,
      effectiveMode,
    };
  },

  async updateSettings(
    companyId: string,
    actorUserId: string,
    input: UpdateCommercialSeatQuotaSettingsInput,
  ): Promise<CommercialSeatQuotaSettingsView> {
    const company = await companyRepository.findById(companyId);
    if (!company) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    }

    const globalMode = commercialSeatQuotaService.getGlobalMode();
    if (input.companyMode === "ENFORCE" && globalMode !== "ENFORCE") {
      throw new AppError(
        400,
        "COMMERCIAL_SEAT_ENFORCE_REQUIRES_GLOBAL_ENFORCE",
        "No se puede habilitar ENFORCE por empresa sin ENFORCE global aprobado.",
      );
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const existing = await companySettingsRepository.findByCompanyIdInTransaction(
        companyId,
        transaction,
        { admissionLock: true },
      );
      if (!existing) {
        throw new AppError(404, "COMPANY_SETTINGS_NOT_FOUND", "Configuración de empresa no encontrada.");
      }

      const previousMode = existing.commercialSeatQuotaMode;
      const updated = await companySettingsRepository.updateCommercialSeatQuotaModeInTransaction(
        transaction,
        companyId,
        input.companyMode,
      );
      if (!updated) {
        throw new AppError(
          409,
          "COMMERCIAL_SEAT_QUOTA_MODE_UPDATE_FAILED",
          "No se pudo actualizar el modo de cupo comercial.",
        );
      }

      await auditService.log(
        companyId,
        {
          entityType: "company_settings",
          entityId: existing.id,
          action: "COMMERCIAL_SEAT_QUOTA_MODE_UPDATE",
          previousData: { commercialSeatQuotaMode: previousMode },
          newData: { commercialSeatQuotaMode: input.companyMode },
          userId: actorUserId,
        },
        transaction,
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return this.getSettings(companyId);
  },
};