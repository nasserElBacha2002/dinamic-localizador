/** Lifecycle states for company commercial subscriptions (no billing automation yet). */
export const BILLING_SUBSCRIPTION_STATUSES = [
  "SCHEDULED",
  "ACTIVE",
  "ENDED",
  "CANCELLED",
] as const;
export type BillingSubscriptionStatus = (typeof BILLING_SUBSCRIPTION_STATUSES)[number];

/** Non-historical statuses guarded by partial unique indexes (at most one per company each). */
export const BILLING_SUBSCRIPTION_OPEN_STATUSES = ["SCHEDULED", "ACTIVE"] as const;
export type BillingSubscriptionOpenStatus = (typeof BILLING_SUBSCRIPTION_OPEN_STATUSES)[number];

export const BILLING_SUBSCRIPTION_FINAL_STATUSES = ["ENDED", "CANCELLED"] as const;
