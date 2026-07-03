import { env } from "../config/env";
import {
  DEFAULT_COMPANY_OPERATIONAL_SETTINGS,
  toCompanySettingsInput,
} from "../constants/company-settings";
import { companyAbsenceSettingsRepository } from "../repositories/company-absence-settings.repository";
import { companyLocationTypesRepository } from "../repositories/company-location-types.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import type { CompanyAbsenceSetting, CompanyLocationType } from "../types/company";
import { companyOperationalSettingsService } from "./company-operational-settings.service";

export type OperationalDefaultsSource = "company_settings" | "operational_defaults" | "environment";

export type InventoryOperationalDefaults = {
  companyId: string;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  source: OperationalDefaultsSource;
};

export type ImportOperationalDefaults = InventoryOperationalDefaults & {
  operationTimezone: string;
  defaultOperationStartTime: string;
  defaultOperationEndTime: string;
  geofenceReviewMarginMeters: number;
  timezoneSource: OperationalDefaultsSource;
  geofenceReviewMarginSource: OperationalDefaultsSource;
};

export type StoreOperationalDefaults = {
  companyId: string;
  defaultRadiusMeters: number;
  source: OperationalDefaultsSource;
};

export type CompanyAbsenceDefault = Pick<
  CompanyAbsenceSetting,
  "absenceTypeCode" | "defaultAnnualDays" | "autoAssignOnEmployeeCreate"
>;

const resolveTimeDefault = (
  companyValue: string | null | undefined,
  fallback: string,
): { value: string; source: OperationalDefaultsSource } => {
  if (companyValue?.trim()) {
    return { value: companyValue.trim(), source: "company_settings" };
  }

  return { value: fallback, source: "operational_defaults" };
};

const resolveGeofenceReviewMargin = (
  companyValue: number | null | undefined,
): { value: number; source: OperationalDefaultsSource } => {
  if (companyValue != null && companyValue >= 0) {
    return { value: companyValue, source: "company_settings" };
  }

  return { value: env.BOT_GEOFENCE_REVIEW_MARGIN_METERS, source: "environment" };
};

const resolveOperationTimezone = (
  companyValue: string | null | undefined,
): { value: string; source: OperationalDefaultsSource } => {
  if (companyValue?.trim()) {
    return { value: companyValue.trim(), source: "company_settings" };
  }

  if (env.BOT_OPERATION_TIMEZONE?.trim()) {
    return { value: env.BOT_OPERATION_TIMEZONE.trim(), source: "environment" };
  }

  return {
    value: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
    source: "operational_defaults",
  };
};

export const companyOperationalDefaultsResolver = {
  async getInventoryDefaults(companyId: string): Promise<InventoryOperationalDefaults> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);

    if (settings) {
      return {
        companyId,
        earlyToleranceMinutes: settings.defaultEarlyArrivalToleranceMinutes,
        lateToleranceMinutes: settings.defaultLateArrivalToleranceMinutes,
        source: "company_settings",
      };
    }

    return {
      companyId,
      earlyToleranceMinutes:
        DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultEarlyArrivalToleranceMinutes,
      lateToleranceMinutes: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultLateArrivalToleranceMinutes,
      source: "operational_defaults",
    };
  },

  async getImportDefaults(companyId: string): Promise<ImportOperationalDefaults> {
    const inventoryDefaults = await this.getInventoryDefaults(companyId);
    const settings = await companySettingsRepository.findByCompanyId(companyId);

    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    const startTime = resolveTimeDefault(
      settings?.defaultOperationStartTime,
      DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationStartTime,
    );
    const endTime = resolveTimeDefault(
      settings?.defaultOperationEndTime,
      DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationEndTime,
    );
    const reviewMargin = resolveGeofenceReviewMargin(settings?.geofenceReviewMarginMeters);

    return {
      ...inventoryDefaults,
      operationTimezone: timezone.value,
      timezoneSource: timezone.source,
      defaultOperationStartTime: startTime.value,
      defaultOperationEndTime: endTime.value,
      geofenceReviewMarginMeters: reviewMargin.value,
      geofenceReviewMarginSource: reviewMargin.source,
    };
  },

  async getStoreDefaults(companyId: string): Promise<StoreOperationalDefaults> {
    const { settings, source } =
      await companyOperationalSettingsService.getCompanyOperationalSettingsWithSource(companyId);

    return {
      companyId,
      defaultRadiusMeters: settings.defaultRadiusMeters,
      source: source === "company_settings" ? "company_settings" : "operational_defaults",
    };
  },

  async getAbsenceDefaults(companyId: string): Promise<CompanyAbsenceDefault[]> {
    const rows = await companyAbsenceSettingsRepository.listByCompanyId(companyId);
    return rows.map((row) => ({
      absenceTypeCode: row.absenceTypeCode,
      defaultAnnualDays: row.defaultAnnualDays,
      autoAssignOnEmployeeCreate: row.autoAssignOnEmployeeCreate,
    }));
  },

  async getLocationTypes(companyId: string): Promise<CompanyLocationType[]> {
    return companyLocationTypesRepository.listByCompanyId(companyId, true);
  },

  /** Used when creating a new company_settings row. */
  buildDefaultSettingsInput() {
    return toCompanySettingsInput();
  },
};
