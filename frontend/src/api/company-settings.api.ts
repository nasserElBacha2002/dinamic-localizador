import type { CompanySettings, UpdateCompanySettingsInput } from "../types/company-settings";
import { scopedApiClient } from "./scoped-client";

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCompanySettings(raw: CompanySettings): CompanySettings {
  return {
    ...raw,
    defaultRadiusMeters: toNumber(raw.defaultRadiusMeters, 150),
    lateGraceMinutes: toNumber(raw.lateGraceMinutes, 15),
    earlyLeaveToleranceMinutes: toNumber(raw.earlyLeaveToleranceMinutes, 15),
    defaultEarlyArrivalToleranceMinutes: toNumber(raw.defaultEarlyArrivalToleranceMinutes, 60),
    defaultLateArrivalToleranceMinutes: toNumber(raw.defaultLateArrivalToleranceMinutes, 90),
    pendingOperationExpirationHours: toNumber(raw.pendingOperationExpirationHours, 12),
  };
}

export async function getCompanySettings(): Promise<CompanySettings> {
  const { data } = await scopedApiClient.get<{ data: CompanySettings }>("settings");
  return normalizeCompanySettings(data.data);
}

export async function updateCompanySettings(
  input: UpdateCompanySettingsInput,
): Promise<CompanySettings> {
  const { data } = await scopedApiClient.patch<{ data: CompanySettings }>("settings", input);
  return normalizeCompanySettings(data.data);
}
