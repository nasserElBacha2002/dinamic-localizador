/**
 * DIN-406 Fase 2A — fixed launch plan (public catalog reference only; not per-seat pricing).
 */
export const BILLING_LAUNCH_PLAN_CODE = "LANZAMIENTO" as const;

export const BILLING_LAUNCH_TIER_CODE = "INCLUIDO_100" as const;

export const BILLING_LAUNCH_PLAN_DISPLAY_NAME = "Plan Lanzamiento";

export const BILLING_LAUNCH_TIER_DISPLAY_NAME = "Hasta 100 colaboradores";

export const BILLING_LAUNCH_INCLUDED_SEAT_MIN = 1;

export const BILLING_LAUNCH_INCLUDED_SEAT_MAX = 100;

/** Fixed monthly catalog amount (USD); not derived from employee count. */
export const BILLING_LAUNCH_FIXED_MONTHLY_USD = "300.000000";

export const BILLING_LAUNCH_PLAN_SORT_ORDER = 10;