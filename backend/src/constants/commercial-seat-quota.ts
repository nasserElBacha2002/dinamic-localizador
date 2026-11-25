/** DIN-463 — commercial collaborator seat quota modes (not WhatsApp quotas). */
export const COMMERCIAL_SEAT_QUOTA_MODES = ["DISABLED", "OBSERVE", "ENFORCE"] as const;

export type CommercialSeatQuotaMode = (typeof COMMERCIAL_SEAT_QUOTA_MODES)[number];

export const COMMERCIAL_SEAT_QUOTA_OPERATIONS = [
  "EMPLOYEE_CREATE",
  "EMPLOYEE_REACTIVATE",
  "EMPLOYEE_IMPORT_BATCH",
  "EMPLOYEE_IMPORT_ROW",
] as const;

export type CommercialSeatQuotaOperation = (typeof COMMERCIAL_SEAT_QUOTA_OPERATIONS)[number];

export const COMMERCIAL_SEAT_QUOTA_DECISIONS = [
  "SKIPPED",
  "ALLOWED",
  "WOULD_EXCEED",
  "REJECTED",
  "INCONSISTENCY",
  "EVALUATION_ERROR",
] as const;

export type CommercialSeatQuotaDecision = (typeof COMMERCIAL_SEAT_QUOTA_DECISIONS)[number];