import { toCompanySettingsInput } from "../constants/company-settings";
import { roleHasPermission } from "../constants/company-permissions";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { companyModuleService } from "./company-module.service";
import { companyAbsenceSettingsService } from "./company-absence-settings.service";
import { companyLocationTypesService } from "./company-location-types.service";
import { companyWorkScheduleService } from "./company-work-schedule.service";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import type { UpdateCompanySettingsInput } from "../schemas/company.schema";
import type { UpdateCompanyAbsenceSettingsInput } from "../schemas/company-absence-settings.schema";
import type {
  CreateCompanyLocationTypeInput,
  UpdateCompanyLocationTypeInput,
} from "../schemas/company-location-type.schema";
import type {
  Company,
  CompanyMembershipSummary,
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
  defaultEarlyArrivalToleranceMinutes: settings.defaultEarlyArrivalToleranceMinutes,
  defaultLateArrivalToleranceMinutes: settings.defaultLateArrivalToleranceMinutes,
  defaultOperationStartTime: settings.defaultOperationStartTime,
  defaultOperationEndTime: settings.defaultOperationEndTime,
  geofenceReviewMarginMeters: settings.geofenceReviewMarginMeters,
  confirmationReminderEnabled: settings.confirmationReminderEnabled,
  confirmationReminderHoursBefore: settings.confirmationReminderHoursBefore,
  pendingOperationExpirationHours: settings.pendingOperationExpirationHours,
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

  async listModules(companyId: string) {
    return companyModuleService.listModules(companyId);
  },

  async getSettings(companyId: string): Promise<CompanySettingsDto> {
    await this.getCompanyOrThrow(companyId);

    const settings = await companySettingsRepository.findOrCreateByCompanyId(
      companyId,
      toCompanySettingsInput(),
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
        ...toCompanySettingsInput(),
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

  async getAbsenceSettings(companyId: string) {
    await this.getCompanyOrThrow(companyId);
    return companyAbsenceSettingsService.getCompanyAbsenceSettings(companyId);
  },

  async updateAbsenceSettings(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    input: UpdateCompanyAbsenceSettingsInput,
  ) {
    await this.getCompanyOrThrow(companyId);
    return companyAbsenceSettingsService.updateCompanyAbsenceSettings(companyId, role, input);
  },

  async listLocationTypes(companyId: string, activeOnly = false) {
    await this.getCompanyOrThrow(companyId);
    return companyLocationTypesService.listLocationTypes(companyId, activeOnly);
  },

  async createLocationType(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    input: CreateCompanyLocationTypeInput,
  ) {
    await this.getCompanyOrThrow(companyId);
    return companyLocationTypesService.createLocationType(companyId, role, input);
  },

  async updateLocationType(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    locationTypeId: string,
    input: UpdateCompanyLocationTypeInput,
  ) {
    await this.getCompanyOrThrow(companyId);
    return companyLocationTypesService.updateLocationType(
      companyId,
      role,
      locationTypeId,
      input,
    );
  },

  async disableLocationType(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    locationTypeId: string,
  ) {
    await this.getCompanyOrThrow(companyId);
    return companyLocationTypesService.disableLocationType(companyId, role, locationTypeId);
  },

  async getWorkSchedule(companyId: string) {
    await this.getCompanyOrThrow(companyId);
    return companyWorkScheduleService.getByCompanyId(companyId);
  },

  async updateWorkSchedule(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    input: { timezone: string; days: import("../types/schedule").WeeklyScheduleDay[] },
  ) {
    if (!roleHasPermission(role, "company:settings:update")) {
      throw new AppError(403, "FORBIDDEN", "No tiene permisos para actualizar la configuración.");
    }

    await this.getCompanyOrThrow(companyId);
    return companyWorkScheduleService.update(companyId, input);
  },

  async getCompanyOrThrow(companyId: string): Promise<Company> {
    const company = await companyRepository.findById(companyId);
    if (!company || company.status !== "ACTIVE") {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    }
    return company;
  },
};
