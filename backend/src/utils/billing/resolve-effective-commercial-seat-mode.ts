import type { CommercialSeatQuotaMode } from "../../constants/commercial-seat-quota";
import { COMMERCIAL_SEAT_QUOTA_MODES } from "../../constants/commercial-seat-quota";

export type CommercialSeatCompanyMode = CommercialSeatQuotaMode | null;

const isCommercialSeatQuotaMode = (value: string): value is CommercialSeatQuotaMode =>
  (COMMERCIAL_SEAT_QUOTA_MODES as readonly string[]).includes(value);

/**
 * DIN-463 matrix — invalid values never yield ENFORCE.
 * Company null = sin configuración (column absent or NULL).
 */
export const parseCommercialSeatQuotaMode = (
  raw: string | null | undefined,
): CommercialSeatQuotaMode | null => {
  if (raw == null || raw.trim() === "") {
    return null;
  }
  const normalized = raw.trim().toUpperCase();
  if (!isCommercialSeatQuotaMode(normalized)) {
    return "DISABLED";
  }
  return normalized;
};

export const parseGlobalCommercialSeatQuotaMode = (
  raw: string | null | undefined,
): CommercialSeatQuotaMode => {
  const parsed = parseCommercialSeatQuotaMode(raw);
  return parsed ?? "DISABLED";
};

export const resolveEffectiveCommercialSeatMode = (
  globalMode: CommercialSeatQuotaMode,
  companyMode: CommercialSeatCompanyMode,
): CommercialSeatQuotaMode => {
  const safeGlobal = isCommercialSeatQuotaMode(globalMode) ? globalMode : "DISABLED";
  const safeCompany =
    companyMode == null
      ? null
      : isCommercialSeatQuotaMode(companyMode)
        ? companyMode
        : "DISABLED";

  if (safeGlobal === "DISABLED") {
    return "DISABLED";
  }

  if (safeGlobal === "OBSERVE") {
    if (safeCompany === "DISABLED") {
      return "DISABLED";
    }
    return "OBSERVE";
  }

  // ENFORCE global
  if (safeCompany === "DISABLED") {
    return "DISABLED";
  }
  if (safeCompany === "ENFORCE") {
    return "ENFORCE";
  }
  return "OBSERVE";
};