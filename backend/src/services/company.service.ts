import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { roleHasPermission } from "../constants/company-permissions";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { companyModuleRepository } from "../repositories/company-module.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import type { UpdateCompanySettingsInput } from "../schemas/company.schema";
import type {
  Company,
  CompanyMembershipSummary,
  CompanyModule,
  CompanySettings,
  CompanySettingsDto,
} from "../types/company";

const toCompanySettingsDto = (settings: CompanySettings): CompanySettingsDto => ({
  companyId: settings.companyId,
  operationTimezone: settings.operationTimezone,
  defaultRadiusMeters: settings.defaultRadiusMeters,
  lateGraceMinutes: settings.lateGraceMinutes,
  earlyLeaveToleranceMinutes: settings.earlyLeaveToleranceMinutes,
  requireCheckoutLocation: settings.requireCheckoutLocation,
  allowManualAttendanceCorrections: settings.allowManualAttendanceCorrections,
  createdAt: settings.createdAt,
  updatedAt: settings.updatedAt,
});

export const companyService = {
  async listForUser(
    userId: string,
    isPlatformAdmin = false,
  ): Promise<CompanyMembershipSummary[]> {
    if (isPlatformAdmin) {
      const companies = await companyRepository.listActive();
      const memberships = await userCompanyMembershipRepository.listActiveForUser(userId);
      const defaultCompanyId =
        memberships.find((membership) => membership.isDefault)?.companyId ??
        memberships[0]?.companyId;

      return companies.map((company) => ({
        companyId: company.id,
        companyName: company.name,
        role: "OWNER",
        isDefault: company.id === defaultCompanyId,
        status: "ACTIVE",
      }));
    }

    return userCompanyMembershipRepository.listActiveForUser(userId);
  },

  async listModules(companyId: string): Promise<CompanyModule[]> {
    return companyModuleRepository.listByCompanyId(companyId);
  },

  async getSettings(companyId: string): Promise<CompanySettingsDto> {
    await this.getCompanyOrThrow(companyId);

    const settings = await companySettingsRepository.findOrCreateByCompanyId(
      companyId,
      DEFAULT_COMPANY_OPERATIONAL_SETTINGS,
    );

    return toCompanySettingsDto(settings);
  },

  async updateSettings(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    input: UpdateCompanySettingsInput,
  ): Promise<CompanySettingsDto> {
    if (!roleHasPermission(role, "company:settings:update")) {
      throw new AppError(403, "FORBIDDEN", "No tiene permisos para actualizar la configuración.");
    }

    await this.getCompanyOrThrow(companyId);

    const existing = await companySettingsRepository.findByCompanyId(companyId);
    if (!existing) {
      const created = await companySettingsRepository.create(companyId, {
        ...DEFAULT_COMPANY_OPERATIONAL_SETTINGS,
        ...input,
      });
      return toCompanySettingsDto(created);
    }

    const updated = await companySettingsRepository.update(companyId, input);
    if (!updated) {
      throw new AppError(404, "COMPANY_SETTINGS_NOT_FOUND", "Configuración de empresa no encontrada.");
    }

    return toCompanySettingsDto(updated);
  },

  async getCompanyOrThrow(companyId: string): Promise<Company> {
    const company = await companyRepository.findById(companyId);
    if (!company || company.status !== "ACTIVE") {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    }
    return company;
  },
};
