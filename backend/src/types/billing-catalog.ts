import type {
  BillingPeriod,
  BillingPlanKind,
  BillingPriceKind,
} from "../constants/billing-catalog";

export interface BillingPlan {
  id: string;
  planCode: string;
  displayName: string;
  description: string | null;
  planKind: BillingPlanKind;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPlanTier {
  id: string;
  billingPlanId: string;
  tierCode: string;
  displayName: string;
  seatMin: number;
  seatMax: number | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPlanPrice {
  id: string;
  billingPlanTierId: string;
  amount: string;
  currency: string;
  billingPeriod: BillingPeriod;
  priceKind: BillingPriceKind;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

export interface BillingPlanTierWithPrices extends BillingPlanTier {
  prices: BillingPlanPrice[];
}

export interface BillingPlanCatalogEntry extends BillingPlan {
  tiers: BillingPlanTierWithPrices[];
}
