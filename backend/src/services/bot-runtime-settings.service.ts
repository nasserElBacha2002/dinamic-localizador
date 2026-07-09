import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import type { BotRuntimeSettings } from "../types/bot-runtime-settings";
import { companyOperationalSettingsService } from "./company-operational-settings.service";

const buildRuntimeSettings = (
  companyId: string,
  operational: {
    operationTimezone: string;
    defaultRadiusMeters: number;
    lateGraceMinutes: number;
    earlyLeaveToleranceMinutes: number;
    requireCheckoutLocation: boolean;
    allowManualAttendanceCorrections: boolean;
    pendingOperationExpirationHours: number;
  },
): BotRuntimeSettings => ({
  companyId,
  operationTimezone:
    operational.operationTimezone.trim() ||
    env.BOT_OPERATION_TIMEZONE ||
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
  defaultRadiusMeters:
    operational.defaultRadiusMeters > 0
      ? operational.defaultRadiusMeters
      : env.BOT_DEFAULT_RADIUS_METERS,
  geofenceReviewMarginMeters: env.BOT_GEOFENCE_REVIEW_MARGIN_METERS,
  lateGraceMinutes:
    operational.lateGraceMinutes >= 0
      ? operational.lateGraceMinutes
      : env.BOT_ON_TIME_GRACE_MINUTES,
  earlyLeaveToleranceMinutes:
    operational.earlyLeaveToleranceMinutes >= 0
      ? operational.earlyLeaveToleranceMinutes
      : env.BOT_CHECKOUT_EARLY_TOLERANCE_MINUTES,
  requireCheckoutLocation: operational.requireCheckoutLocation,
  allowManualAttendanceCorrections: operational.allowManualAttendanceCorrections,
  pendingOperationExpirationHours:
    operational.pendingOperationExpirationHours >= 1
      ? operational.pendingOperationExpirationHours
      : DEFAULT_COMPANY_OPERATIONAL_SETTINGS.pendingOperationExpirationHours,
  sessionTtlMinutes: env.BOT_SESSION_TTL_MINUTES,
});

const shouldRethrowSettingsError = (error: unknown): boolean => {
  if (error instanceof AppError) {
    return error.statusCode >= 400 && error.statusCode < 500;
  }

  return false;
};

export const botRuntimeSettingsService = {
  async getBotRuntimeSettings(companyId: string): Promise<BotRuntimeSettings> {
    try {
      const { settings: operational, source } =
        await companyOperationalSettingsService.getCompanyOperationalSettingsWithSource(companyId);
      const settings = buildRuntimeSettings(companyId, operational);

      console.info("[bot-runtime-settings] resolved", {
        companyId,
        settingsSource: source,
      });

      return settings;
    } catch (error) {
      if (shouldRethrowSettingsError(error)) {
        throw error;
      }

      const fallback = buildRuntimeSettings(companyId, {
        ...DEFAULT_COMPANY_OPERATIONAL_SETTINGS,
      });

      console.warn("[bot-runtime-settings] failed to load company settings, using fallbacks", {
        companyId,
        errorCode: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });

      return fallback;
    }
  },
};
