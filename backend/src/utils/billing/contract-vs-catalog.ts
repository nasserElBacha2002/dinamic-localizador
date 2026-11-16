import type { BillingPeriod, BillingPriceKind } from "../../constants/billing-catalog";
import type { BillingPlanPrice } from "../../types/billing-catalog";
import type { BillingSubscriptionTerm } from "../../types/billing-subscription";
import { normalizeDecimalString } from "../money-decimal";

export interface ContractCatalogComparison {
  agreedAmount: string;
  catalogAmount: string | null;
  amountDiffersFromCatalog: boolean;
  agreedSeatMax: number | null;
  catalogSeatMax: number | null;
  seatCapacityDiffersFromCatalog: boolean;
  currency: string;
  billingPeriod: BillingPeriod;
  priceKind: BillingPriceKind;
}

export const compareTermToCatalogPrice = (
  term: Pick<
    BillingSubscriptionTerm,
  "agreedAmount" | "currency" | "billingPeriod" | "priceKind" | "seatMax"
  >,
  catalogPrice: BillingPlanPrice | null,
  catalogSeatMax: number | null,
): ContractCatalogComparison => {
  const agreedAmount = normalizeDecimalString(term.agreedAmount) ?? term.agreedAmount;
  const catalogAmount = catalogPrice ? normalizeDecimalString(catalogPrice.amount) : null;
  const amountDiffersFromCatalog =
    catalogAmount != null ? agreedAmount !== catalogAmount : false;
  const agreedSeatMax = term.seatMax;
  const seatCapacityDiffersFromCatalog =
    catalogSeatMax != null && agreedSeatMax != null
      ? agreedSeatMax !== catalogSeatMax
      : catalogSeatMax != null && agreedSeatMax == null;

  return {
    agreedAmount,
    catalogAmount,
    amountDiffersFromCatalog,
    agreedSeatMax,
    catalogSeatMax,
    seatCapacityDiffersFromCatalog,
    currency: term.currency,
    billingPeriod: term.billingPeriod,
    priceKind: term.priceKind,
  };
};