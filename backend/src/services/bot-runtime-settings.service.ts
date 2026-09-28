import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import type { BotRuntimeSettings } from "../types/bot-runtime-settings";
import type { CompanySettings } from "../types/company";
import { geofencePolicyResolver } from "./geofence-policy.resolver";

const toOperationalSlice = (settings: CompanySettings) => ({
  companyId: settings.companyId,
  operationTimezone: settings.operationTimezone,
  defaultRadiusMeters: settings.defaultRadiusMeters,
  earlyLeaveToleranceMinutes: settings.earlyLeaveToleranceMinutes,
  requireCheckoutLocation: settings.requireCheckoutLocation,
  allowManualAttendanceCorrections: settings.allowManualAttendanceCorrections,
  pendingOperationExpirationHours: settings.pendingOperationExpirationHours,
});

const buildRuntimeSettings = (
  companyId: string,
  operational: {
    operationTimezone: string;
    defaultRadiusMeters: number;
    earlyLeaveToleranceMinutes: number;
    requireCheckoutLocation: boolean;
    allowManualAttendanceCorrections: boolean;
    pendingOperationExpirationHours: number;
  },
  geofenceMarginMeters: number,
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
  geofenceReviewMarginMeters: geofenceMarginMeters,
  earlyLeaveToleranceMinutes:
    operational.earlyLeaveToleranceMinutes >= 0
      ? operational.earlyLeaveToleranceMinutes
      : DEFAULT_COMPANY_OPERATIONAL_SETTINGS.earlyLeaveToleranceMinutes,
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
  /**
   * Loads company settings once, then derives operational + geofence policy
   * from the same snapshot (CQ-001 / single settings snapshot).
   */
  async getBotRuntimeSettings(companyId: string): Promise<BotRuntimeSettings> {
    try {
      const row = await companySettingsRepository.findByCompanyId(companyId);
      const source = row ? "company_settings" : "operational_defaults";
      const operational = row
        ? toOperationalSlice(row)
        : { companyId, ...DEFAULT_COMPANY_OPERATIONAL_SETTINGS };

      const geofencePolicy = geofencePolicyResolver.resolveFromSettings(companyId, row, 0);
      const settings = buildRuntimeSettings(
        companyId,
        operational,
        geofencePolicy.marginMeters,
      );

      console.info("[bot-runtime-settings] resolved", {
        companyId,
        settingsSource: source,
        geofenceMarginSource: geofencePolicy.marginSource,
        geofenceRadiusSource: geofencePolicy.radiusSource,
        settingsSnapshot: "single",
      });

      return settings;
    } catch (error) {
      if (shouldRethrowSettingsError(error)) {
        throw error;
      }

      if (error instanceof AppError && error.code === "GEOFENCE_POLICY_UNAVAILABLE") {
        throw error;
      }

      throw new AppError(
        503,
        "BOT_RUNTIME_SETTINGS_UNAVAILABLE",
        "No se pudieron cargar la configuración operativa del bot. Reintentá más tarde.",
        {
          companyId,
          cause: error instanceof Error ? error.message : "UNKNOWN",
        },
      );
    }
  },
};
