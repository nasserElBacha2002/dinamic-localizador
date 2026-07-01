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
>;

const toOperationalSettings = (settings: CompanySettings): CompanyOperationalSettings => ({
  companyId: settings.companyId,
  operationTimezone: settings.operationTimezone,
  defaultRadiusMeters: settings.defaultRadiusMeters,
  lateGraceMinutes: settings.lateGraceMinutes,
  earlyLeaveToleranceMinutes: settings.earlyLeaveToleranceMinutes,
  requireCheckoutLocation: settings.requireCheckoutLocation,
  allowManualAttendanceCorrections: settings.allowManualAttendanceCorrections,
});

export const companyOperationalSettingsService = {
  async getCompanyOperationalSettings(companyId: string): Promise<CompanyOperationalSettings> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    if (settings) {
      return toOperationalSettings(settings);
    }

    return {
      companyId,
      ...DEFAULT_COMPANY_OPERATIONAL_SETTINGS,
    };
  },
};
