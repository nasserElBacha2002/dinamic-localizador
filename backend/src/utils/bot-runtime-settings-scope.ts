import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { env } from "../config/env";
import type { BotRuntimeSettings } from "../types/bot-runtime-settings";

const botRuntimeSettingsStorage = new AsyncLocalStorage<BotRuntimeSettings>();

export function runWithBotRuntimeSettings<T>(
  settings: BotRuntimeSettings,
  callback: () => T | Promise<T>,
): T | Promise<T> {
  return botRuntimeSettingsStorage.run(settings, callback);
}

export function getBotRuntimeSettings(): BotRuntimeSettings | undefined {
  return botRuntimeSettingsStorage.getStore();
}

export function getBotOperationTimezone(): string {
  return getBotRuntimeSettings()?.operationTimezone ?? env.BOT_OPERATION_TIMEZONE;
}

export function getDefaultRadiusMeters(): number {
  return getBotRuntimeSettings()?.defaultRadiusMeters ?? env.BOT_DEFAULT_RADIUS_METERS;
}

export function getGeofenceReviewMarginMeters(): number {
  return getBotRuntimeSettings()?.geofenceReviewMarginMeters ?? env.BOT_GEOFENCE_REVIEW_MARGIN_METERS;
}

export function getLateGraceMinutes(): number {
  return getBotRuntimeSettings()?.lateGraceMinutes ?? env.BOT_ON_TIME_GRACE_MINUTES;
}

export function getEarlyLeaveToleranceMinutes(): number {
  return (
    getBotRuntimeSettings()?.earlyLeaveToleranceMinutes ?? env.BOT_CHECKOUT_EARLY_TOLERANCE_MINUTES
  );
}

export function getRequireCheckoutLocation(): boolean {
  return getBotRuntimeSettings()?.requireCheckoutLocation ?? true;
}

export function getPendingOperationExpirationHours(): number {
  return (
    getBotRuntimeSettings()?.pendingOperationExpirationHours ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.pendingOperationExpirationHours
  );
}

export function getSessionTtlMinutes(): number {
  return getBotRuntimeSettings()?.sessionTtlMinutes ?? env.BOT_SESSION_TTL_MINUTES;
}

export function resolveEffectiveAllowedRadiusMeters(serviceRadiusMeters: number): number {
  if (serviceRadiusMeters > 0) {
    return serviceRadiusMeters;
  }

  return getDefaultRadiusMeters();
}
