import {
  BILLING_LAUNCH_FIXED_MONTHLY_USD,
  BILLING_LAUNCH_INCLUDED_SEAT_MAX,
} from "../../constants/billing-launch-plan";
import { normalizeDecimalString } from "../money-decimal";

export const launchPlanFixedMonthlyUsd = (): string =>
  normalizeDecimalString(BILLING_LAUNCH_FIXED_MONTHLY_USD) ?? "300";

export const isLaunchFixedMonthlyAmount = (amount: string): boolean =>
  (normalizeDecimalString(amount) ?? "") === launchPlanFixedMonthlyUsd();

/**
 * Capacity above the included launch tier requires explicit negotiated contractual terms.
 * This phase does not block operations; it classifies when negotiation is required.
 */
export const requiresNegotiatedSeatCapacity = (
  requestedSeatMax: number | null,
  catalogIncludedSeatMax: number | null = BILLING_LAUNCH_INCLUDED_SEAT_MAX,
): boolean =>
  requestedSeatMax !== null &&
  catalogIncludedSeatMax !== null &&
  requestedSeatMax > catalogIncludedSeatMax;

/** Launch pricing is a flat monthly fee; employee headcount must not be used as a price multiplier. */
export const agreedAmountMatchesLaunchFixedPrice = (
  agreedAmount: string,
  _activeEmployeeCount: number,
): boolean => isLaunchFixedMonthlyAmount(agreedAmount);