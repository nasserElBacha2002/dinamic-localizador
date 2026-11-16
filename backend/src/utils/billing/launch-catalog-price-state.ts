import type { BillingPlanPrice } from "../../types/billing-catalog";
import { normalizeDecimalString } from "../money-decimal";

export type LaunchTierPriceCatalogState =
  | "EMPTY"
  | "OPEN_ONLY"
  | "VERSIONED_WITH_OPEN"
  | "ADMIN_MODIFIED_OPEN"
  | "HISTORY_WITHOUT_OPEN"
  | "FUTURE_SCHEDULED_WITHOUT_OPEN";

const isPriceActiveAt = (price: BillingPlanPrice, at: Date): boolean => {
  const from = new Date(price.effectiveFrom);
  const to = price.effectiveTo ? new Date(price.effectiveTo) : null;
  const atMs = at.getTime();
  return from.getTime() <= atMs && (to === null || to.getTime() > atMs);
};

export const classifyLaunchTierPriceCatalogState = (input: {
  prices: BillingPlanPrice[];
  openPrice: BillingPlanPrice | null;
  initialAmountUsd: string;
  referenceAt: Date;
}): LaunchTierPriceCatalogState => {
  if (input.prices.length === 0) {
    return "EMPTY";
  }

  const activeAtReference = input.prices.filter((price) => isPriceActiveAt(price, input.referenceAt));

  if (input.openPrice) {
    const openAmount = normalizeDecimalString(input.openPrice.amount);
    const initialAmount = normalizeDecimalString(input.initialAmountUsd);
    const openActiveAtReference = isPriceActiveAt(input.openPrice, input.referenceAt);

    if (openActiveAtReference && openAmount === initialAmount && input.prices.length === 1) {
      return "OPEN_ONLY";
    }

    if (openActiveAtReference) {
      return activeAtReference.length > 1 ? "VERSIONED_WITH_OPEN" : "ADMIN_MODIFIED_OPEN";
    }
  }

  if (activeAtReference.length > 0) {
    return "VERSIONED_WITH_OPEN";
  }

  const hasFutureFromReference = input.prices.some(
    (price) => new Date(price.effectiveFrom).getTime() > input.referenceAt.getTime(),
  );
  if (hasFutureFromReference) {
    return "FUTURE_SCHEDULED_WITHOUT_OPEN";
  }

  return "HISTORY_WITHOUT_OPEN";
};