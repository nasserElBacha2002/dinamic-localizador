import sql from "mssql";
import { resolveDefaultCompanyAbsenceSetting } from "../constants/company-absence";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { roleHasPermission } from "../constants/company-permissions";
import { AppError } from "../errors/app-error";
import { absenceBalanceRepository } from "../repositories/absence-balance.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { companyAbsenceSettingsRepository } from "../repositories/company-absence-settings.repository";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import type { UpdateCompanyAbsenceSettingsInput } from "../schemas/company-absence-settings.schema";
import type { CompanyMembershipSummary } from "../types/company";
import { getCurrentYearInTimezone } from "../utils/operational-year";

export type CompanyAbsenceSettingView = {
  absenceTypeCode: string;
  absenceTypeName: string;
  isActive: boolean;
  defaultAnnualDays: number;
  autoAssignOnEmployeeCreate: boolean;
};

const assertActiveCompany = async (companyId: string): Promise<void> => {
  const company = await companyRepository.findById(companyId);
  if (!company || company.status !== "ACTIVE") {
    throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
  }
};

const buildSettingViews = async (companyId: string): Promise<CompanyAbsenceSettingView[]> => {
  const [absenceTypes, settings] = await Promise.all([
    absenceTypeRepository.listAll(companyId, false),
    companyAbsenceSettingsRepository.listByCompanyId(companyId),
  ]);

  const settingsByCode = new Map(settings.map((row) => [row.absenceTypeCode, row]));

  return absenceTypes.map((type) => {
    const stored = settingsByCode.get(type.code);
    const defaults = resolveDefaultCompanyAbsenceSetting(type.code);

    return {
      absenceTypeCode: type.code,
      absenceTypeName: type.name,
      isActive: type.isActive,
      defaultAnnualDays: stored?.defaultAnnualDays ?? defaults.defaultAnnualDays,
      autoAssignOnEmployeeCreate:
        stored?.autoAssignOnEmployeeCreate ?? defaults.autoAssignOnEmployeeCreate,
    };
  });
};

export const companyAbsenceSettingsService = {
  async ensureAbsenceCatalogForCompany(
    companyId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    await absenceTypeRepository.ensureStandardTypesForCompany(companyId, transaction);
    await companyAbsenceSettingsRepository.ensureDefaultSettingsForCompany(companyId, transaction);
  },

  async getCompanyAbsenceSettings(companyId: string): Promise<CompanyAbsenceSettingView[]> {
    await assertActiveCompany(companyId);
    await this.ensureAbsenceCatalogForCompany(companyId);
    return buildSettingViews(companyId);
  },

  async updateCompanyAbsenceSettings(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    input: UpdateCompanyAbsenceSettingsInput,
  ): Promise<CompanyAbsenceSettingView[]> {
    if (!roleHasPermission(role, "company:settings:update")) {
      throw new AppError(403, "FORBIDDEN", "No tiene permisos para actualizar la configuración.");
    }

    await assertActiveCompany(companyId);
    await this.ensureAbsenceCatalogForCompany(companyId);

    for (const setting of input.settings) {
      const absenceType = await absenceTypeRepository.findByCode(
        companyId,
        setting.absenceTypeCode.trim().toUpperCase(),
      );
      if (!absenceType) {
        throw new AppError(
          400,
          "UNKNOWN_ABSENCE_TYPE",
          `El tipo de ausencia ${setting.absenceTypeCode} no existe para esta empresa.`,
        );
      }

      await companyAbsenceSettingsRepository.upsert(companyId, {
        absenceTypeCode: absenceType.code,
        defaultAnnualDays: setting.defaultAnnualDays,
        autoAssignOnEmployeeCreate: setting.autoAssignOnEmployeeCreate,
      });
    }

    return buildSettingViews(companyId);
  },

  async initializeEmployeeAbsenceBalances(
    companyId: string,
    employeeId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    if (!transaction) {
      await this.ensureAbsenceCatalogForCompany(companyId);
    }

    const settings = await companyAbsenceSettingsRepository.listByCompanyId(companyId);
    const companySettings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone =
      companySettings?.operationTimezone ??
      DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone;
    const year = getCurrentYearInTimezone(timezone);

    for (const setting of settings) {
      if (!setting.autoAssignOnEmployeeCreate) {
        continue;
      }

      const absenceType = await absenceTypeRepository.findByCode(companyId, setting.absenceTypeCode);
      if (!absenceType || !absenceType.isActive) {
        continue;
      }

      await absenceBalanceRepository.createIfNotExists(
        companyId,
        {
          employeeId,
          absenceTypeId: absenceType.id,
          year,
          totalDays: setting.defaultAnnualDays,
          notes: null,
        },
        transaction,
      );
    }
  },
};
