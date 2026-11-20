export const COMMERCIAL_BENEFIT_KINDS = [
  "FIXED_FINAL_AMOUNT",
  "PERCENT_DISCOUNT",
  "FIXED_AMOUNT_DISCOUNT",
] as const;

export type CommercialBenefitKind = (typeof COMMERCIAL_BENEFIT_KINDS)[number];

/** Legacy JSON-in-reference prefix (read compatibility only). */
export const COMMERCIAL_BENEFIT_REFERENCE_PREFIX = "DIN406_BENEFIT:v1:";

/** Row marker when structured benefit columns are populated. */
export const COMMERCIAL_BENEFIT_ROW_MARKER = "DIN406_BENEFIT";