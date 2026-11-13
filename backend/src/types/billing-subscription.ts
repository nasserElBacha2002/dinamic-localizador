import type {
  BillingPeriod,
  BillingPriceKind,
} from "../constants/billing-catalog";
import type { BillingSubscriptionStatus } from "../constants/billing-subscription";

export interface BillingSubscription {
  id: string;
  companyId: string;
  billingPlanId: string;
  billingPlanTierId: string | null;
  subscriptionStatus: BillingSubscriptionStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingSubscriptionTerm {
  id: string;
  billingSubscriptionId: string;
  agreedAmount: string;
  currency: string;
  billingPeriod: BillingPeriod;
  priceKind: BillingPriceKind;
  seatMin: number;
  seatMax: number | null;
  billingPlanId: string | null;
  billingPlanTierId: string | null;
  billingPlanPriceId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface BillingSubscriptionWithTerms extends BillingSubscription {
  terms: BillingSubscriptionTerm[];
}
