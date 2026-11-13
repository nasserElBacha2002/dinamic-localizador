/** Structural plan kinds — not commercial SKU names. */
export const BILLING_PLAN_KINDS = ["STANDARD", "CUSTOM"] as const;
export type BillingPlanKind = (typeof BILLING_PLAN_KINDS)[number];

export const BILLING_PERIODS = ["MONTHLY", "YEARLY"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const BILLING_PRICE_KINDS = ["REGULAR", "PROMOTIONAL"] as const;
export type BillingPriceKind = (typeof BILLING_PRICE_KINDS)[number];
