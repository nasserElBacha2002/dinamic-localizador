import { env } from "../config/env";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";

/**
 * Canonical operation timezone fallback chain (runtime).
 *
 * 1. company_settings.operation_timezone (when non-empty)
 * 2. BOT_OPERATION_TIMEZONE env (when non-empty)
 * 3. DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone
 *
 * SQL migrations cannot read env vars; they use company_settings.operation_timezone,
 * then companies.default_timezone, then the same application default constant.
 */
export const DEFAULT_OPERATION_TIMEZONE =
  DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone;

/** Windows timezone name used by SQL Server AT TIME ZONE for the application default IANA zone. */
export const DEFAULT_OPERATION_TIMEZONE_SQL = "Argentina Standard Time";

export const resolveOperationTimezone = (
  companyTimezone?: string | null,
  companyDefaultTimezone?: string | null,
): string => {
  if (companyTimezone?.trim()) {
    return companyTimezone.trim();
  }

  if (env.BOT_OPERATION_TIMEZONE?.trim()) {
    return env.BOT_OPERATION_TIMEZONE.trim();
  }

  if (companyDefaultTimezone?.trim()) {
    return companyDefaultTimezone.trim();
  }

  return DEFAULT_OPERATION_TIMEZONE;
};
