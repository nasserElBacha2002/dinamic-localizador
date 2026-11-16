import type { BillingPeriod, BillingPriceKind } from "../../constants/billing-catalog";
import { AppError } from "../../errors/app-error";
import { billingPlanPriceRepository } from "../../repositories/billing/billing-plan-price.repository";
import { billingPlanRepository } from "../../repositories/billing/billing-plan.repository";
import { billingPlanTierRepository } from "../../repositories/billing/billing-plan-tier.repository";
import type {
  BillingSubscription,
  BillingSubscriptionTerm,
  BillingSubscriptionWithTerms,
} from "../../types/billing-subscription";
import { requiresNegotiatedSeatCapacity } from "../../utils/billing/launch-plan-contract";
import { compareTermToCatalogPrice, type ContractCatalogComparison } from "../../utils/billing/contract-vs-catalog";
import type { AdminCommercialBenefitIdentity } from "../../utils/billing/billing-admin-request-idempotency";
import { billingCommercialAdminService } from "./billing-commercial-admin.service";
import { billingPolicyService } from "./billing-policy.service";
import { billingSubscriptionService } from "./billing-subscription.service";

export interface CompanyCommercialContractView {
  companyId: string;
  billingPolicy: Awaited<ReturnType<typeof billingPolicyService.getCompanyBillingPolicy>>;
  subscriptions: BillingSubscription[];
  currentSubscription: BillingSubscription | null;
  currentTerms: BillingSubscriptionTerm | null;
  termsHistory: BillingSubscriptionTerm[];
  catalogComparison: ContractCatalogComparison | null;
  isCustomPlan: boolean;
}

const assertPlanAllowsNegotiatedTerms = async (input: {
  billingPlanId: string;
  billingPlanTierId?: string | null;
  seatMin: number;
  seatMax: number | null;
  agreedAmount: string;
  currency: string;
  billingPeriod: BillingPeriod;
  priceKind: BillingPriceKind;
  termEffectiveFrom: Date;
}): Promise<void> => {
  const plan = await billingPlanRepository.findById(input.billingPlanId);
  if (!plan) {
    throw new AppError(404, "BILLING_PLAN_NOT_FOUND", "Plan comercial no encontrado.");
  }

  if (plan.planKind === "CUSTOM") {
    return;
  }

  let catalogSeatMax: number | null = null;
  if (input.billingPlanTierId) {
    const tier = await billingPlanTierRepository.findById(input.billingPlanTierId);
    if (!tier) {
      throw new AppError(404, "BILLING_TIER_NOT_FOUND", "Escalón de plan no encontrado.");
    }
    catalogSeatMax = tier.seatMax;
  }

  if (requiresNegotiatedSeatCapacity(input.seatMax, catalogSeatMax)) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_REQUIRES_NEGOTIATED_PLAN",
      "La capacidad acordada requiere un plan CUSTOM negociado.",
    );
  }

  if (plan.planKind === "STANDARD" && plan.isPublicForNewSubscription === true) {
    const catalogPrice = input.billingPlanTierId
      ? await billingPlanPriceRepository.findActiveAt({
          billingPlanTierId: input.billingPlanTierId,
          currency: input.currency,
          billingPeriod: input.billingPeriod,
          priceKind: input.priceKind,
          at: input.termEffectiveFrom,
        })
      : null;

    if (catalogPrice) {
      const comparison = compareTermToCatalogPrice(
        {
          agreedAmount: input.agreedAmount,
          currency: input.currency,
          billingPeriod: input.billingPeriod,
          priceKind: input.priceKind,
          seatMax: input.seatMax,
        },
        catalogPrice,
        catalogSeatMax,
      );
      if (comparison.amountDiffersFromCatalog || comparison.seatCapacityDiffersFromCatalog) {
        throw new AppError(
          409,
          "BILLING_NEGOTIATED_TERMS_REQUIRE_CUSTOM_OR_ADMIN_MODIFICATION",
          "Importe o capacidad distintos del catálogo público requieren plan CUSTOM o modificación administrativa explícita.",
        );
      }
    }
  }
};

const buildCatalogComparison = async (
  subscription: BillingSubscription,
  term: BillingSubscriptionTerm | null,
  at: Date,
): Promise<ContractCatalogComparison | null> => {
  if (!term) {
    return null;
  }
  const tierId = subscription.billingPlanTierId;
  if (!tierId) {
    return compareTermToCatalogPrice(term, null, null);
  }
  const catalogPrice = await billingPlanPriceRepository.findActiveAt({
    billingPlanTierId: tierId,
    currency: term.currency,
    billingPeriod: term.billingPeriod,
    priceKind: term.priceKind,
    at,
  });
  const tier = await billingPlanTierRepository.findById(tierId);
  return compareTermToCatalogPrice(term, catalogPrice, tier?.seatMax ?? null);
};

/**
 * Explicit commercial flows for negotiated agreements and manual term versions (DIN-406 Fase 2B).
 * Reuses subscription versioning; does not alter public catalog rows.
 */
export const billingNegotiatedContractService = {
  async getCompanyCommercialContracts(
    companyId: string,
    at?: Date,
  ): Promise<CompanyCommercialContractView> {
    const referenceAt = at ?? new Date();
    const billingPolicy = await billingPolicyService.getCompanyBillingPolicy(companyId);
    const subscriptions = await billingCommercialAdminService.listCompanySubscriptions(companyId);
    const currentSubscription = await billingSubscriptionService.getCurrentSubscription(
      companyId,
      referenceAt,
    );
    let currentTerms: BillingSubscriptionTerm | null = null;
    let termsHistory: BillingSubscriptionTerm[] = [];
    let isCustomPlan = false;

    if (currentSubscription) {
      currentTerms = await billingSubscriptionService.getCurrentTerms(
        currentSubscription.id,
        referenceAt,
      );
      termsHistory = await billingSubscriptionService.listTermsHistory(currentSubscription.id);
      const plan = await billingPlanRepository.findById(currentSubscription.billingPlanId);
      isCustomPlan = plan?.planKind === "CUSTOM";
    }

    const catalogComparison = currentSubscription
      ? await buildCatalogComparison(currentSubscription, currentTerms, referenceAt)
      : null;

    return {
      companyId,
      billingPolicy,
      subscriptions,
      currentSubscription,
      currentTerms,
      termsHistory,
      catalogComparison,
      isCustomPlan,
    };
  },

  async createNegotiatedAgreement(input: {
    companyId: string;
    billingPlanId: string;
    billingPlanTierId?: string | null;
    subscriptionStatus?: "ACTIVE" | "SCHEDULED";
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    agreedAmount: string;
    currency: string;
    billingPeriod: BillingPeriod;
    priceKind?: BillingPriceKind;
    seatMin: number;
    seatMax?: number | null;
    commercialReference?: string | null;
    actorUserId: string;
    adminRequestKey?: string | null;
  }): Promise<BillingSubscriptionWithTerms> {
    const policy = await billingPolicyService.getCompanyBillingPolicy(input.companyId);
    if (policy.isExempt) {
      // Strategic exemption persists; recording commercial rows must not imply enforceable billing.
    }

    const priceKind = input.priceKind ?? "REGULAR";
    const seatMax = input.seatMax === undefined ? null : input.seatMax;

    await assertPlanAllowsNegotiatedTerms({
      billingPlanId: input.billingPlanId,
      billingPlanTierId: input.billingPlanTierId,
      seatMin: input.seatMin,
      seatMax,
      agreedAmount: input.agreedAmount,
      currency: input.currency,
      billingPeriod: input.billingPeriod,
      priceKind,
      termEffectiveFrom: input.effectiveFrom,
    });

    const created = await billingSubscriptionService.createAdminSubscription({
      companyId: input.companyId,
      billingPlanId: input.billingPlanId,
      billingPlanTierId: input.billingPlanTierId,
      subscriptionStatus: input.subscriptionStatus ?? "ACTIVE",
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      adminRequestKey: input.adminRequestKey,
      initialTerms: {
        agreedAmount: input.agreedAmount,
        currency: input.currency,
        billingPeriod: input.billingPeriod,
        priceKind,
        seatMin: input.seatMin,
        seatMax,
        effectiveFrom: input.effectiveFrom,
        commercialReference: input.commercialReference,
        createdByUserId: input.actorUserId,
        adminRequestKey: input.adminRequestKey,
      },
      transactionAudit: {
        companyId: input.companyId,
        entityType: "billing_subscription",
        action: "COMMERCIAL_NEGOTIATED_AGREEMENT_CREATED",
        userId: input.actorUserId,
        reason: input.commercialReference ?? null,
        resolveEntityId: ({ subscription }) => subscription.id,
        resolveNewData: ({ subscription }) => ({
          subscriptionId: subscription.id,
          planId: input.billingPlanId,
          agreedAmount: input.agreedAmount,
          seatMin: input.seatMin,
          seatMax,
          commercialReference: input.commercialReference ?? null,
        }),
      },
    });

    const { idempotentReplay: _replay, ...result } = created;
    return result;
  },

  async modifyContractualTerms(input: {
    subscriptionId: string;
    companyId: string;
    agreedAmount: string;
    currency: string;
    billingPeriod: BillingPeriod;
    priceKind?: BillingPriceKind;
    seatMin: number;
    seatMax?: number | null;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    commercialReference?: string | null;
    commercialBenefit?: AdminCommercialBenefitIdentity | null;
    actorUserId: string;
    adminRequestKey?: string | null;
  }): Promise<BillingSubscriptionTerm> {
    const subscription = await billingSubscriptionService.getSubscriptionWithTerms(
      input.subscriptionId,
    );
    if (!subscription) {
      throw new AppError(404, "BILLING_SUBSCRIPTION_NOT_FOUND", "Suscripción comercial no encontrada.");
    }
    if (subscription.companyId.toUpperCase() !== input.companyId.toUpperCase()) {
      throw new AppError(
        403,
        "BILLING_SUBSCRIPTION_COMPANY_MISMATCH",
        "La suscripción no pertenece a la empresa indicada.",
      );
    }

    const previousTerms = await billingSubscriptionService.getCurrentTerms(
      input.subscriptionId,
      input.effectiveFrom,
    );

    const priceKind = input.priceKind ?? "REGULAR";
    const seatMax = input.seatMax === undefined ? null : input.seatMax;

    const created = await billingSubscriptionService.registerContractualTerms({
      subscriptionId: input.subscriptionId,
      agreedAmount: input.agreedAmount,
      currency: input.currency,
      billingPeriod: input.billingPeriod,
      priceKind,
      seatMin: input.seatMin,
      seatMax,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      commercialReference: input.commercialReference,
      commercialBenefit: input.commercialBenefit ?? null,
      createdByUserId: input.actorUserId,
      adminRequestKey: input.adminRequestKey,
      transactionAudit: {
        companyId: input.companyId,
        entityType: "billing_subscription_term",
        action: "COMMERCIAL_CONTRACT_TERMS_MODIFIED",
        userId: input.actorUserId,
        reason: input.commercialBenefit?.reason ?? input.commercialReference ?? null,
        previousData: previousTerms
          ? {
              termId: previousTerms.id,
              agreedAmount: previousTerms.agreedAmount,
              seatMin: previousTerms.seatMin,
              seatMax: previousTerms.seatMax,
              effectiveFrom: previousTerms.effectiveFrom,
            }
          : null,
        resolveEntityId: ({ term }) => term!.id,
        resolveNewData: ({ term }) => ({
          termId: term!.id,
          agreedAmount: term!.agreedAmount,
          seatMin: term!.seatMin,
          seatMax: term!.seatMax,
          effectiveFrom: term!.effectiveFrom,
        }),
      },
    });

    const { idempotentReplay: _replay, ...term } = created;
    return term;
  },

  /**
   * Closes the open standard subscription and opens an explicit CUSTOM subscription.
   * Does not mutate billing_plan_id on the historical subscription row.
   */
  async transitionStandardToCustomNegotiatedAgreement(input: {
    companyId: string;
    currentSubscriptionId: string;
    customBillingPlanId: string;
    transitionAt: Date;
    agreedAmount: string;
    currency: string;
    billingPeriod: BillingPeriod;
    priceKind?: BillingPriceKind;
    seatMin: number;
    seatMax?: number | null;
    commercialReference?: string | null;
    actorUserId: string;
    adminRequestKey?: string | null;
  }): Promise<{
    previousSubscription: BillingSubscriptionWithTerms;
    customSubscription: BillingSubscriptionWithTerms;
  }> {
    const current = await billingSubscriptionService.getSubscriptionWithTerms(
      input.currentSubscriptionId,
    );
    if (!current) {
      throw new AppError(404, "BILLING_SUBSCRIPTION_NOT_FOUND", "Suscripción comercial no encontrada.");
    }
    if (current.companyId.toUpperCase() !== input.companyId.toUpperCase()) {
      throw new AppError(
        403,
        "BILLING_SUBSCRIPTION_COMPANY_MISMATCH",
        "La suscripción no pertenece a la empresa indicada.",
      );
    }
    if (input.transitionAt.getTime() < new Date(current.effectiveFrom).getTime()) {
      throw new AppError(
        400,
        "BILLING_INVALID_EFFECTIVE_RANGE",
        "La transición no puede ser anterior al inicio del contrato vigente.",
      );
    }

    const planBefore = await billingPlanRepository.findById(current.billingPlanId);
    if (!planBefore) {
      throw new AppError(404, "BILLING_PLAN_NOT_FOUND", "Plan comercial no encontrado.");
    }
    const customPlan = await billingPlanRepository.findById(input.customBillingPlanId);
    if (!customPlan || customPlan.planKind !== "CUSTOM") {
      throw new AppError(
        409,
        "BILLING_SUBSCRIPTION_REQUIRES_NEGOTIATED_PLAN",
        "La transición requiere un plan CUSTOM explícito.",
      );
    }

    const previousSubscription = await billingSubscriptionService.finalizeSubscription({
      subscriptionId: current.id,
      finalStatus: "ENDED",
      endedAt: input.transitionAt,
      effectiveTo: input.transitionAt,
    });

    const customSubscription = await this.createNegotiatedAgreement({
      companyId: input.companyId,
      billingPlanId: customPlan.id,
      effectiveFrom: input.transitionAt,
      agreedAmount: input.agreedAmount,
      currency: input.currency,
      billingPeriod: input.billingPeriod,
      priceKind: input.priceKind,
      seatMin: input.seatMin,
      seatMax: input.seatMax,
      commercialReference: input.commercialReference,
      actorUserId: input.actorUserId,
      adminRequestKey: input.adminRequestKey,
    });

    const previousPlanAfter = await billingPlanRepository.findById(previousSubscription.billingPlanId);
    if (previousPlanAfter?.planKind !== planBefore.planKind) {
      throw new AppError(
        500,
        "BILLING_SUBSCRIPTION_PLAN_HISTORY_CORRUPTED",
        "El plan histórico de la suscripción cerrada fue alterado.",
      );
    }

    return { previousSubscription, customSubscription };
  },
};