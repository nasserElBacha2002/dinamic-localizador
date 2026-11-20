import sql from "mssql";
import {
  BILLING_LAUNCH_PLAN_CODE,
  BILLING_LAUNCH_TIER_CODE,
} from "../../constants/billing-launch-plan";
import type { BillingPeriod, BillingPriceKind } from "../../constants/billing-catalog";
import { getPool } from "../../database/connection";
import { billingPlanPriceRepository } from "../../repositories/billing/billing-plan-price.repository";
import { billingPlanTierRepository } from "../../repositories/billing/billing-plan-tier.repository";
import { billingPlanRepository } from "../../repositories/billing/billing-plan.repository";
import type {
  BillingPlan,
  BillingPlanCatalogEntry,
  BillingPlanPrice,
  BillingPlanTier,
} from "../../types/billing-catalog";
import type { BillingSubscription, BillingSubscriptionWithTerms } from "../../types/billing-subscription";
import { billingCatalogService } from "./billing-catalog.service";
import { billingSubscriptionService } from "./billing-subscription.service";

export interface BillingLaunchPlanSnapshot {
  plan: BillingPlan;
  includedTier: BillingPlanTier;
  currentRegularPrice: BillingPlanPrice | null;
}

/**
 * Rows with explicit CUSTOM commercial plans only.
 * Phase 2A does not infer historical negotiation by comparing terms to the mutable catalog tier.
 */
export interface CustomPlanSubscriptionRow {
  subscriptionId: string;
  companyId: string;
  planCode: string;
  planKind: string;
  seatMax: number | null;
}

/**
 * Backend support for future commercial administration (Fase 4 UI).
 * Reuses catalog and subscription services; no duplicate billing stack.
 */
export const billingCommercialAdminService = {
  async listCommercialCatalog(input?: {
    at?: Date;
    activeOnly?: boolean;
  }): Promise<BillingPlanCatalogEntry[]> {
    return billingCatalogService.getCatalog(input);
  },

  async listPlansAvailableForNewPublicSubscription(
    at?: Date,
  ): Promise<BillingPlanCatalogEntry[]> {
    const atInstant = at ?? new Date();
    const publicPlans = await billingPlanRepository.listPublicForNewSubscription(atInstant);
    const catalog = await billingCatalogService.getCatalog({
      at: atInstant,
      activeOnly: true,
    });
    const publicPlanIds = new Set(publicPlans.map((plan) => plan.id));
    return catalog.filter((entry) => publicPlanIds.has(entry.id));
  },

  async setPlanPublicForNewSubscription(
    planId: string,
    isPublicForNewSubscription: boolean,
  ): Promise<BillingPlan> {
    return billingPlanRepository.updateMetadata(planId, { isPublicForNewSubscription });
  },

  async getLaunchPlanSnapshot(at?: Date): Promise<BillingLaunchPlanSnapshot | null> {
    const plan = await billingPlanRepository.findByCode(BILLING_LAUNCH_PLAN_CODE);
    if (!plan) {
      return null;
    }
    const tiers = await billingPlanTierRepository.listByPlanId(plan.id);
    const includedTier =
      tiers.find(
        (tier) => tier.tierCode === BILLING_LAUNCH_TIER_CODE && tier.isActive,
      ) ?? null;
    if (!includedTier) {
      return null;
    }
    const currentRegularPrice = await billingPlanPriceRepository.findActiveAt({
      billingPlanTierId: includedTier.id,
      currency: "USD",
      billingPeriod: "MONTHLY",
      priceKind: "REGULAR",
      at: at ?? new Date(),
    });
    return { plan, includedTier, currentRegularPrice };
  },

  listTierPriceHistory(billingPlanTierId: string): Promise<BillingPlanPrice[]> {
    return billingCatalogService.listTierPriceHistory(billingPlanTierId);
  },

  publishCatalogPriceVersion(input: {
    billingPlanTierId: string;
    amount: string;
    currency: string;
    billingPeriod: BillingPeriod;
    priceKind?: BillingPriceKind;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
  }): Promise<BillingPlanPrice> {
    return billingCatalogService.publishPriceVersion(input);
  },

  updatePlanMetadata(
    planId: string,
    input: {
      displayName?: string;
      description?: string | null;
      sortOrder?: number;
      isActive?: boolean;
      isPublicForNewSubscription?: boolean;
    },
  ) {
    return billingCatalogService.updatePlan(planId, input);
  },

  updateTierMetadata(
    tierId: string,
    input: {
      displayName?: string;
      seatMin?: number;
      seatMax?: number | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return billingCatalogService.updateTier(tierId, input);
  },

  listCompanySubscriptions(companyId: string): Promise<BillingSubscription[]> {
    return billingSubscriptionService.listSubscriptionHistory(companyId);
  },

  getSubscriptionWithTerms(
    subscriptionId: string,
  ): Promise<BillingSubscriptionWithTerms | null> {
    return billingSubscriptionService.getSubscriptionWithTerms(subscriptionId);
  },

  async countOpenSubscriptionsByPlanId(planId: string): Promise<number> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("planId", sql.UniqueIdentifier, planId)
      .query(`
        SELECT COUNT(*) AS c
        FROM dbo.billing_subscriptions
        WHERE billing_plan_id = @planId
          AND subscription_status IN (N'ACTIVE', N'SCHEDULED')
      `);
    return Number(result.recordset[0]?.c ?? 0);
  },

  /**
   * Lists open CUSTOM-plan subscriptions. Does not classify STANDARD plans against today's catalog tier.
   */
  async findCustomPlanSubscriptions(at?: Date): Promise<CustomPlanSubscriptionRow[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("at", sql.DateTime2, at ?? new Date())
      .query(`
        SELECT DISTINCT
          s.id AS subscription_id,
          s.company_id,
          p.plan_code,
          p.plan_kind,
          bt.seat_max
        FROM dbo.billing_subscriptions s
        INNER JOIN dbo.billing_plans p ON p.id = s.billing_plan_id
        INNER JOIN dbo.billing_subscription_terms bt
          ON bt.billing_subscription_id = s.id
          AND bt.cancelled_at IS NULL
          AND bt.effective_from <= @at
          AND (bt.effective_to IS NULL OR bt.effective_to > @at)
        WHERE s.subscription_status IN (N'ACTIVE', N'SCHEDULED')
          AND p.plan_kind = N'CUSTOM'
      `);

    return result.recordset.map((row) => ({
      subscriptionId: String(row.subscription_id),
      companyId: String(row.company_id),
      planCode: String(row.plan_code),
      planKind: String(row.plan_kind),
      seatMax:
        row.seat_max === null || row.seat_max === undefined ? null : Number(row.seat_max),
    }));
  },

  /** @deprecated Phase 2A — use findCustomPlanSubscriptions; see CustomPlanSubscriptionRow docs. */
  async findNegotiatedCapacitySubscriptions(at?: Date): Promise<CustomPlanSubscriptionRow[]> {
    return this.findCustomPlanSubscriptions(at);
  },
};