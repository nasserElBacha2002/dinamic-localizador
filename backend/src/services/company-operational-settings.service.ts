import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import type { CompanySettings } from "../types/company";

export type CompanyOperationalSettings = Pick<
  CompanySettings,
  | "companyId"
  | "operationTimezone"
  | "defaultRadiusMeters"
  | "lateGraceMinutes"
  | "earlyLeaveToleranceMinutes"
  | "requireCheckoutLocation"
  | "allowManualAttendanceCorrections"
  | "pendingOperationExpirationHours"
>;

export type CompanyOperationalSettingsSource = "company_settings" | "operational_defaults";

const toOperationalSettings = (settings: CompanySettings): CompanyOperationalSettings => ({
  companyId: settings.companyId,
  operationTimezone: settings.operationTimezone,
  defaultRadiusMeters: settings.defaultRadiusMeters,
  lateGraceMinutes: settings.lateGraceMinutes,
  earlyLeaveToleranceMinutes: settings.earlyLeaveToleranceMinutes,
  requireCheckoutLocation: settings.requireCheckoutLocation,
  allowManualAttendanceCorrections: settings.allowManualAttendanceCorrections,
  pendingOperationExpirationHours: settings.pendingOperationExpirationHours,
});

export const companyOperationalSettingsService = {
  async getCompanyOperationalSettings(companyId: string): Promise<CompanyOperationalSettings> {
    const resolved = await this.getCompanyOperationalSettingsWithSource(companyId);
    return resolved.settings;
  },

  async getCompanyOperationalSettingsWithSource(companyId: string): Promise<{
    settings: CompanyOperationalSettings;
    source: CompanyOperationalSettingsSource;
  }> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    if (settings) {
      return {
        settings: toOperationalSettings(settings),
        source: "company_settings",
      };
    }

    return {
      settings: {
        companyId,
        ...DEFAULT_COMPANY_OPERATIONAL_SETTINGS,
      },
      source: "operational_defaults",
    };
  },
};
