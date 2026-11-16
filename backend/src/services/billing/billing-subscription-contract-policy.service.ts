import type { BillingPeriod, BillingPriceKind } from "../../constants/billing-catalog";
import { AppError } from "../../errors/app-error";
import { billingPlanPriceRepository } from "../../repositories/billing/billing-plan-price.repository";
import { billingPlanTierRepository } from "../../repositories/billing/billing-plan-tier.repository";
import type { BillingPlan, BillingPlanPrice } from "../../types/billing-catalog";
import { requiresNegotiatedSeatCapacity } from "../../utils/billing/launch-plan-contract";
import { normalizeDecimalString } from "../../utils/money-decimal";
import { billingPolicyService } from "./billing-policy.service";

const isCatalogPriceEffectiveAt = (price: BillingPlanPrice, at: Date): boolean => {
  const from = new Date(price.effectiveFrom);
  const to = price.effectiveTo ? new Date(price.effectiveTo) : null;
  const atMs = at.getTime();
  return from.getTime() <= atMs && (to === null || to.getTime() > atMs);
};

const assertReferencedCatalogPrice = async (input: {
  billingPlanPriceId: string;
  billingPlanId: string;
  billingPlanTierId: string | null;
  currency: string;
  billingPeriod: BillingPeriod;
  priceKind: BillingPriceKind;
  termEffectiveFrom: Date;
}): Promise<BillingPlanPrice> => {
  const price = await billingPlanPriceRepository.findById(input.billingPlanPriceId);
  if (!price) {
    throw new AppError(404, "BILLING_PLAN_PRICE_NOT_FOUND", "Precio de catálogo no encontrado.");
  }

  const priceTier = await billingPlanTierRepository.findById(price.billingPlanTierId);
  if (!priceTier || priceTier.billingPlanId !== input.billingPlanId) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
      "El precio de catálogo no corresponde al plan contratado.",
    );
  }

  if (input.billingPlanTierId && price.billingPlanTierId !== input.billingPlanTierId) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
      "El precio de catálogo no corresponde al escalón contratado.",
    );
  }

  if (price.currency !== input.currency) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
      "El precio de catálogo no corresponde a la moneda acordada.",
    );
  }

  if (price.billingPeriod !== input.billingPeriod) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
      "El precio de catálogo no corresponde al período acordado.",
    );
  }

  if (price.priceKind !== input.priceKind) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
      "El precio de catálogo no corresponde al tipo de precio acordado.",
    );
  }

  if (!isCatalogPriceEffectiveAt(price, input.termEffectiveFrom)) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_NOT_EFFECTIVE",
      "El precio de catálogo no está vigente para la fecha contractual indicada.",
    );
  }

  return price;
};

export const assertCompatibleSubscriptionContractTerms = async (input: {
  companyId: string;
  plan: BillingPlan;
  tierResolved: {
    tierId: string;
    seatMin: number;
    seatMax: number | null;
  } | null;
  agreedAmount: string;
  currency: string;
  billingPeriod: BillingPeriod;
  priceKind: BillingPriceKind;
  termEffectiveFrom: Date;
  seatMin: number;
  seatMax: number | null;
  billingPlanPriceId?: string | null;
}): Promise<void> => {
  const policy = await billingPolicyService.getCompanyBillingPolicy(input.companyId);
  if (policy.isExempt) {
    return;
  }

  if (input.plan.planKind === "CUSTOM") {
    return;
  }

  if (input.plan.planKind !== "STANDARD" || !input.tierResolved) {
    return;
  }

  const catalogSeatMax = input.tierResolved.seatMax;
  if (requiresNegotiatedSeatCapacity(input.seatMax, catalogSeatMax)) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_REQUIRES_NEGOTIATED_PLAN",
      "La capacidad solicitada supera la incluida en el plan público; use un plan CUSTOM negociado.",
    );
  }

  const isPublicStandardOffering = input.plan.isPublicForNewSubscription === true;

  let catalogAmount: string;
  if (input.billingPlanPriceId) {
    const referencedPrice = await assertReferencedCatalogPrice({
      billingPlanPriceId: input.billingPlanPriceId,
      billingPlanId: input.plan.id,
      billingPlanTierId: input.tierResolved.tierId,
      currency: input.currency,
      billingPeriod: input.billingPeriod,
      priceKind: input.priceKind,
      termEffectiveFrom: input.termEffectiveFrom,
    });
    const referencedAmount = normalizeDecimalString(referencedPrice.amount);
    if (!referencedAmount) {
      throw new AppError(
        409,
        "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
        "El precio de catálogo no tiene un importe válido.",
      );
    }
    catalogAmount = referencedAmount;
  } else if (isPublicStandardOffering) {
    const catalogPrice = await billingPlanPriceRepository.findActiveAt({
      billingPlanTierId: input.tierResolved.tierId,
      currency: input.currency,
      billingPeriod: input.billingPeriod,
      priceKind: input.priceKind,
      at: input.termEffectiveFrom,
    });

    if (!catalogPrice) {
      throw new AppError(
        409,
        "BILLING_SUBSCRIPTION_CATALOG_PRICE_UNAVAILABLE",
        "No hay precio de catálogo vigente para contratar el plan público estándar.",
      );
    }

    const activeCatalogAmount = normalizeDecimalString(catalogPrice.amount);
    if (!activeCatalogAmount) {
      throw new AppError(
        409,
        "BILLING_SUBSCRIPTION_CATALOG_PRICE_UNAVAILABLE",
        "No hay precio de catálogo vigente para contratar el plan público estándar.",
      );
    }
    catalogAmount = activeCatalogAmount;
  } else {
    return;
  }

  const agreed = normalizeDecimalString(input.agreedAmount);
  if (agreed !== catalogAmount) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_AMOUNT_MISMATCH",
      "El importe acordado no coincide con el precio de catálogo vigente para el plan estándar.",
    );
  }
};