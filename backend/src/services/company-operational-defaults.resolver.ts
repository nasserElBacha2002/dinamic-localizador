import { env } from "../config/env";
import {
  DEFAULT_COMPANY_OPERATIONAL_SETTINGS,
  toCompanySettingsInput,
} from "../constants/company-settings";
import { companyAbsenceSettingsRepository } from "../repositories/company-absence-settings.repository";
import { companyLocationTypesRepository } from "../repositories/company-location-types.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import type { CompanyAbsenceSetting, CompanyLocationType, CompanySettings } from "../types/company";
import { companyOperationalSettingsService } from "./company-operational-settings.service";
import { resolveOperationTimezone } from "../utils/operation-timezone";

export type OperationalDefaultsSource = "company_settings" | "operational_defaults" | "environment";

export type OperationOperationalDefaults = {
  companyId: string;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  source: OperationalDefaultsSource;
};

export type ImportOperationalDefaults = OperationOperationalDefaults & {
  operationTimezone: string;
  defaultOperationStartTime: string;
  defaultOperationEndTime: string;
  geofenceReviewMarginMeters: number;
  timezoneSource: OperationalDefaultsSource;
  geofenceReviewMarginSource: OperationalDefaultsSource;
};

export type ServiceOperationalDefaults = {
  companyId: string;
  defaultRadiusMeters: number;
  source: OperationalDefaultsSource;
};

export type CompanyAbsenceDefault = Pick<
  CompanyAbsenceSetting,
  "absenceTypeCode" | "defaultAnnualDays" | "autoAssignOnEmployeeCreate"
>;

const buildOperationDefaults = (
  companyId: string,
  settings: CompanySettings | null,
): OperationOperationalDefaults => {
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
};

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

const resolveOperationTimezoneWithSource = (
  companyValue: string | null | undefined,
): { value: string; source: OperationalDefaultsSource } => {
  const resolved = resolveOperationTimezone(companyValue);
  if (companyValue?.trim()) {
    return { value: resolved, source: "company_settings" };
  }
  if (env.BOT_OPERATION_TIMEZONE?.trim()) {
    return { value: resolved, source: "environment" };
  }
  return { value: resolved, source: "operational_defaults" };
};

const buildImportDefaults = (
  companyId: string,
  settings: CompanySettings | null,
): ImportOperationalDefaults => {
  const operationDefaults = buildOperationDefaults(companyId, settings);
  const timezone = resolveOperationTimezoneWithSource(settings?.operationTimezone);
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
    ...operationDefaults,
    operationTimezone: timezone.value,
    timezoneSource: timezone.source,
    defaultOperationStartTime: startTime.value,
    defaultOperationEndTime: endTime.value,
    geofenceReviewMarginMeters: reviewMargin.value,
    geofenceReviewMarginSource: reviewMargin.source,
  };
};

export const companyOperationalDefaultsResolver = {
  async getOperationDefaults(companyId: string): Promise<OperationOperationalDefaults> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    return buildOperationDefaults(companyId, settings);
  },

  async getImportDefaults(companyId: string): Promise<ImportOperationalDefaults> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    return buildImportDefaults(companyId, settings);
  },

  async getServiceDefaults(companyId: string): Promise<ServiceOperationalDefaults> {
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
