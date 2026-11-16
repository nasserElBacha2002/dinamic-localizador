import type { BillingPeriod } from "../../constants/billing-catalog";
import {
  COMMERCIAL_BENEFIT_ROW_MARKER,
  type CommercialBenefitKind,
} from "../../constants/billing-commercial-benefit";
import { BILLING_SUBSCRIPTION_OPEN_STATUSES } from "../../constants/billing-subscription";
import type { BillingSubscriptionStatus } from "../../constants/billing-subscription";
import { AppError } from "../../errors/app-error";
import type { BillingSubscription, BillingSubscriptionTerm } from "../../types/billing-subscription";
import {
  assertBenefitFinalAmount,
  formatBenefitAmount,
} from "../../utils/billing/commercial-benefit-decimal";
import { readCommercialBenefitFromTerm } from "../../utils/billing/commercial-benefit-reference";
import { billingCommercialAdminService } from "./billing-commercial-admin.service";
import { billingPolicyService } from "./billing-policy.service";
import { billingSubscriptionService } from "./billing-subscription.service";
import { billingNegotiatedContractService } from "./billing-negotiated-contract.service";

export type CommercialBenefitView = {
  termId: string;
  subscriptionId: string;
  companyId: string;
  kind: CommercialBenefitKind;
  baseAmount: string;
  finalAmount: string;
  agreedAmount: string;
  currency: string;
  billingPeriod: BillingPeriod;
  seatMin: number;
  seatMax: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string;
  permanent: boolean;
  adminRequestKey: string | null;
  createdAt: string;
  status: "ACTIVE" | "FUTURE" | "ENDED";
  lacksAgreedSuccessor: boolean;
};

const classifyBenefitStatus = (
  term: BillingSubscriptionTerm,
  at: Date,
): "ACTIVE" | "FUTURE" | "ENDED" => {
  const from = new Date(term.effectiveFrom).getTime();
  const to = term.effectiveTo ? new Date(term.effectiveTo).getTime() : null;
  if (from > at.getTime()) {
    return "FUTURE";
  }
  if (to != null && to <= at.getTime()) {
    return "ENDED";
  }
  return "ACTIVE";
};

const mapBenefitTerm = (
  term: BillingSubscriptionTerm,
  companyId: string,
  at: Date,
  lacksAgreedSuccessor: boolean,
): CommercialBenefitView | null => {
  const payload = readCommercialBenefitFromTerm(term);
  if (!payload) {
    return null;
  }
  return {
    termId: term.id,
    subscriptionId: term.billingSubscriptionId,
    companyId,
    kind: payload.kind,
    baseAmount: payload.baseAmount,
    finalAmount: payload.finalAmount,
    agreedAmount: term.agreedAmount,
    currency: term.currency,
    billingPeriod: term.billingPeriod,
    seatMin: term.seatMin,
    seatMax: term.seatMax,
    effectiveFrom: term.effectiveFrom,
    effectiveTo: term.effectiveTo,
    reason: payload.reason,
    permanent: payload.permanent,
    adminRequestKey: term.adminRequestKey,
    createdAt: term.createdAt,
    status: classifyBenefitStatus(term, at),
    lacksAgreedSuccessor,
  };
};

const resolveBaseAmount = async (
  subscriptionId: string,
  referenceAt: Date,
  override?: string | null,
): Promise<string> => {
  if (override) {
    return formatBenefitAmount(override);
  }
  const current = await billingSubscriptionService.getCurrentTerms(subscriptionId, referenceAt);
  if (!current) {
    throw new AppError(
      409,
      "BILLING_BENEFIT_BASE_TERMS_MISSING",
      "No hay condiciones vigentes para calcular el beneficio.",
    );
  }
  return formatBenefitAmount(current.agreedAmount);
};

const openSubscriptionStatuses = new Set<BillingSubscriptionStatus>(BILLING_SUBSCRIPTION_OPEN_STATUSES);

const subscriptionRepresentsContractualContinuity = (
  subscriptionStatus: BillingSubscriptionStatus | undefined,
): boolean => subscriptionStatus != null && openSubscriptionStatuses.has(subscriptionStatus);

export const termHasAgreedContractualSuccessor = (
  term: BillingSubscriptionTerm,
  allTerms: BillingSubscriptionTerm[],
  subscriptionStatusById: ReadonlyMap<string, BillingSubscriptionStatus>,
): boolean => {
  if (term.effectiveTo == null) {
    return false;
  }
  const endMs = new Date(term.effectiveTo).getTime();
  return allTerms.some((candidate) => {
    if (candidate.id === term.id || candidate.cancelledAt != null) {
      return false;
    }
    if (new Date(candidate.effectiveFrom).getTime() !== endMs) {
      return false;
    }
    const status = subscriptionStatusById.get(candidate.billingSubscriptionId);
    return subscriptionRepresentsContractualContinuity(status);
  });
};

/**
 * DIN-406 Fase 2C — individual commercial benefits via explicit contractual term versions.
 */
export const billingCommercialBenefitService = {
  async listCompanyCommercialBenefits(
    companyId: string,
    at?: Date,
  ): Promise<{
    active: CommercialBenefitView[];
    future: CommercialBenefitView[];
    ended: CommercialBenefitView[];
    withoutAgreedSuccessor: CommercialBenefitView[];
    history: CommercialBenefitView[];
  }> {
    const referenceAt = at ?? new Date();
    const subscriptions = await billingCommercialAdminService.listCompanySubscriptions(companyId);
    const subscriptionStatusById = new Map(
      subscriptions.map((subscription) => [subscription.id, subscription.subscriptionStatus]),
    );

    const termsBySubscriptionId = new Map<string, BillingSubscriptionTerm[]>();
    await Promise.all(
      subscriptions.map(async (subscription) => {
        const terms = await billingSubscriptionService.listTermsHistory(subscription.id);
        termsBySubscriptionId.set(subscription.id, terms);
      }),
    );

    const allCompanyTerms = subscriptions.flatMap(
      (subscription) => termsBySubscriptionId.get(subscription.id) ?? [],
    );

    const views: CommercialBenefitView[] = [];
    for (const subscription of subscriptions) {
      const terms = termsBySubscriptionId.get(subscription.id) ?? [];
      for (const term of terms) {
        const lacksSuccessor = !termHasAgreedContractualSuccessor(
          term,
          allCompanyTerms,
          subscriptionStatusById,
        );
        const mapped = mapBenefitTerm(term, companyId, referenceAt, lacksSuccessor);
        if (mapped) {
          views.push(mapped);
        }
      }
    }

    views.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());

    return {
      active: views.filter((row) => row.status === "ACTIVE"),
      future: views.filter((row) => row.status === "FUTURE"),
      ended: views.filter((row) => row.status === "ENDED"),
      withoutAgreedSuccessor: views.filter(
        (row) => row.lacksAgreedSuccessor && row.effectiveTo != null,
      ),
      history: views,
    };
  },

  async registerCommercialBenefit(input: {
    companyId: string;
    subscriptionId: string;
    benefitKind: CommercialBenefitKind;
    baseAmount?: string | null;
    discountPercent?: string | null;
    discountAmount?: string | null;
    finalAgreedAmount: string;
    currency: string;
    billingPeriod: BillingPeriod;
    seatMin: number;
    seatMax?: number | null;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    reason: string;
    actorUserId: string;
    adminRequestKey?: string | null;
  }): Promise<BillingSubscriptionTerm> {
    const policy = await billingPolicyService.getCompanyBillingPolicy(input.companyId);
    if (policy.isExempt) {
      // Strategic exemption prevails; benefit rows remain administrative evidence only.
    }

    const referenceBase = await resolveBaseAmount(
      input.subscriptionId,
      input.effectiveFrom,
      input.baseAmount,
    );
    const finalAmount = assertBenefitFinalAmount(referenceBase, input.benefitKind, {
      finalAgreedAmount: input.finalAgreedAmount,
      discountPercent: input.discountPercent,
      discountAmount: input.discountAmount,
    });

    const seatMax = input.seatMax === undefined ? null : input.seatMax;
    const reason = input.reason.trim();

    return billingNegotiatedContractService.modifyContractualTerms({
      subscriptionId: input.subscriptionId,
      companyId: input.companyId,
      agreedAmount: finalAmount,
      currency: input.currency,
      billingPeriod: input.billingPeriod,
      priceKind: "PROMOTIONAL",
      seatMin: input.seatMin,
      seatMax,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      commercialReference: COMMERCIAL_BENEFIT_ROW_MARKER,
      commercialBenefit: {
        kind: input.benefitKind,
        baseAmount: referenceBase,
        discountPercent: input.discountPercent ?? null,
        discountAmount: input.discountAmount ?? null,
        reason,
      },
      actorUserId: input.actorUserId,
      adminRequestKey: input.adminRequestKey,
    });
  },
};