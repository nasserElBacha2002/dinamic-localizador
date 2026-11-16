import { createHash } from "node:crypto";
import type { CommercialBenefitKind } from "../../constants/billing-commercial-benefit";
import type { BillingPeriod, BillingPriceKind } from "../../constants/billing-catalog";
import type { BillingSubscriptionOpenStatus } from "../../constants/billing-subscription";
import { AppError } from "../../errors/app-error";
import type {
  BillingSubscription,
  BillingSubscriptionTerm,
} from "../../types/billing-subscription";
import { normalizeDecimalString } from "../money-decimal";

const ADMIN_REQUEST_PAYLOAD_MISMATCH = "BILLING_ADMIN_REQUEST_PAYLOAD_MISMATCH";

const toInstantMs = (value: Date | string): number => new Date(value).getTime();

const normalizeUuid = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  return value.trim().toUpperCase();
};

const amountsEqual = (left: string, right: string): boolean => {
  const a = normalizeDecimalString(left);
  const b = normalizeDecimalString(right);
  if (!a || !b) {
    return left.trim() === right.trim();
  }
  return a === b;
};

const throwPayloadMismatch = (): never => {
  throw new AppError(
    409,
    ADMIN_REQUEST_PAYLOAD_MISMATCH,
    "La clave de idempotencia administrativa ya existe con condiciones distintas.",
  );
};

const digestHex = (payload: Record<string, unknown>): string =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export type AdminCommercialBenefitIdentity = {
  kind: CommercialBenefitKind;
  baseAmount: string;
  discountPercent: string | null;
  discountAmount: string | null;
  reason: string;
};

const benefitIdentityForDigest = (
  identity: AdminCommercialBenefitIdentity | null | undefined,
): Record<string, unknown> | null => {
  if (!identity) {
    return null;
  }
  return {
    kind: identity.kind,
    baseAmount: normalizeDecimalString(identity.baseAmount) ?? identity.baseAmount.trim(),
    discountPercent:
      identity.discountPercent == null
        ? null
        : normalizeDecimalString(identity.discountPercent) ?? identity.discountPercent.trim(),
    discountAmount:
      identity.discountAmount == null
        ? null
        : normalizeDecimalString(identity.discountAmount) ?? identity.discountAmount.trim(),
    reason: identity.reason.trim(),
  };
};

export const commercialBenefitIdentityFromTerm = (
  term: BillingSubscriptionTerm,
): AdminCommercialBenefitIdentity | null => {
  if (!term.commercialBenefitKind) {
    return null;
  }
  return {
    kind: term.commercialBenefitKind,
    baseAmount: term.commercialBenefitBaseAmount ?? term.agreedAmount,
    discountPercent: term.commercialBenefitDiscountPercent,
    discountAmount: term.commercialBenefitDiscountAmount,
    reason: term.commercialBenefitReason ?? "",
  };
};

export const computeAdminSubscriptionCreateDigest = (
  snapshot: AdminSubscriptionCreateSnapshot,
): string =>
  digestHex({
    operation: snapshot.operation,
    companyId: normalizeUuid(snapshot.companyId),
    billingPlanId: normalizeUuid(snapshot.billingPlanId),
    billingPlanTierId: normalizeUuid(snapshot.billingPlanTierId),
    subscriptionStatus: snapshot.subscriptionStatus,
    subscriptionEffectiveFromMs: toInstantMs(snapshot.subscriptionEffectiveFrom),
    subscriptionEffectiveToMs: snapshot.subscriptionEffectiveTo
      ? toInstantMs(snapshot.subscriptionEffectiveTo)
      : null,
    agreedAmount: normalizeDecimalString(snapshot.agreedAmount) ?? snapshot.agreedAmount.trim(),
    currency: snapshot.currency.toUpperCase(),
    billingPeriod: snapshot.billingPeriod,
    priceKind: snapshot.priceKind,
    seatMin: snapshot.seatMin,
    seatMax: snapshot.seatMax ?? null,
    termEffectiveFromMs: toInstantMs(snapshot.termEffectiveFrom),
    termEffectiveToMs: snapshot.termEffectiveTo ? toInstantMs(snapshot.termEffectiveTo) : null,
    billingPlanPriceId: normalizeUuid(snapshot.billingPlanPriceId),
  });

export const computeAdminContractualTermDigest = (
  snapshot: AdminContractualTermSnapshot,
): string =>
  digestHex({
    operation: snapshot.operation,
    subscriptionId: normalizeUuid(snapshot.subscriptionId),
    agreedAmount: normalizeDecimalString(snapshot.agreedAmount) ?? snapshot.agreedAmount.trim(),
    currency: snapshot.currency.toUpperCase(),
    billingPeriod: snapshot.billingPeriod,
    priceKind: snapshot.priceKind,
    seatMin: snapshot.seatMin,
    seatMax: snapshot.seatMax ?? null,
    effectiveFromMs: toInstantMs(snapshot.effectiveFrom),
    effectiveToMs: snapshot.effectiveTo ? toInstantMs(snapshot.effectiveTo) : null,
    billingPlanPriceId: normalizeUuid(snapshot.billingPlanPriceId),
    commercialReference: normalizeOptionalText(snapshot.commercialReference),
    commercialBenefit: benefitIdentityForDigest(snapshot.commercialBenefit),
    // createdByUserId is audit-only; excluded from idempotency identity.
  });

export type AdminSubscriptionCreateSnapshot = {
  operation: "CREATE_SUBSCRIPTION";
  companyId: string;
  billingPlanId: string;
  billingPlanTierId: string | null;
  subscriptionStatus: BillingSubscriptionOpenStatus;
  subscriptionEffectiveFrom: Date;
  subscriptionEffectiveTo: Date | null;
  agreedAmount: string;
  currency: string;
  billingPeriod: BillingPeriod;
  priceKind: BillingPriceKind;
  seatMin: number;
  seatMax: number | null;
  termEffectiveFrom: Date;
  termEffectiveTo: Date | null;
  billingPlanPriceId: string | null;
};

export type AdminContractualTermSnapshot = {
  operation: "REGISTER_TERMS";
  subscriptionId: string;
  agreedAmount: string;
  currency: string;
  billingPeriod: BillingPeriod;
  priceKind: BillingPriceKind;
  seatMin: number;
  seatMax: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  billingPlanPriceId: string | null;
  commercialReference: string | null;
  commercialBenefit: AdminCommercialBenefitIdentity | null;
};

export const assertExistingSubscriptionCreateMatchesSnapshot = (
  subscription: BillingSubscription,
  terms: BillingSubscriptionTerm[],
  termAdminRequestKey: string,
  snapshot: AdminSubscriptionCreateSnapshot,
): BillingSubscriptionTerm | null => {
  const expectedSubscriptionDigest = computeAdminSubscriptionCreateDigest(snapshot);
  if (subscription.adminRequestIdempotencyDigest) {
    if (subscription.adminRequestIdempotencyDigest.toLowerCase() !== expectedSubscriptionDigest) {
      throwPayloadMismatch();
    }
  } else if (normalizeUuid(subscription.companyId) !== normalizeUuid(snapshot.companyId)) {
    throwPayloadMismatch();
  } else if (normalizeUuid(subscription.billingPlanId) !== normalizeUuid(snapshot.billingPlanId)) {
    throwPayloadMismatch();
  } else if (
    normalizeUuid(subscription.billingPlanTierId) !== normalizeUuid(snapshot.billingPlanTierId)
  ) {
    throwPayloadMismatch();
  } else if (subscription.subscriptionStatus !== snapshot.subscriptionStatus) {
    throwPayloadMismatch();
  } else if (
    toInstantMs(subscription.effectiveFrom) !== toInstantMs(snapshot.subscriptionEffectiveFrom)
  ) {
    throwPayloadMismatch();
  } else {
    const subEnd = subscription.effectiveTo ? toInstantMs(subscription.effectiveTo) : null;
    const snapSubEnd = snapshot.subscriptionEffectiveTo
      ? toInstantMs(snapshot.subscriptionEffectiveTo)
      : null;
    if (subEnd !== snapSubEnd) {
      throwPayloadMismatch();
    }
  }

  const term = terms.find(
    (row) =>
      row.adminRequestKey != null && row.adminRequestKey.trim() === termAdminRequestKey.trim(),
  );

  if (!term) {
    return null;
  }

  assertExistingTermMatchesSnapshot(term, {
    operation: "REGISTER_TERMS",
    subscriptionId: subscription.id,
    agreedAmount: snapshot.agreedAmount,
    currency: snapshot.currency,
    billingPeriod: snapshot.billingPeriod,
    priceKind: snapshot.priceKind,
    seatMin: snapshot.seatMin,
    seatMax: snapshot.seatMax,
    effectiveFrom: snapshot.termEffectiveFrom,
    effectiveTo: snapshot.termEffectiveTo,
    billingPlanPriceId: snapshot.billingPlanPriceId,
    commercialReference: null,
    commercialBenefit: null,
  });

  return term;
};

export const assertExistingTermMatchesSnapshot = (
  term: BillingSubscriptionTerm,
  snapshot: AdminContractualTermSnapshot,
): void => {
  const expectedDigest = computeAdminContractualTermDigest(snapshot);
  if (term.adminRequestIdempotencyDigest) {
    if (term.adminRequestIdempotencyDigest.toLowerCase() !== expectedDigest) {
      throwPayloadMismatch();
    }
    return;
  }

  if (normalizeUuid(term.billingSubscriptionId) !== normalizeUuid(snapshot.subscriptionId)) {
    throwPayloadMismatch();
  }
  if (!amountsEqual(term.agreedAmount, snapshot.agreedAmount)) {
    throwPayloadMismatch();
  }
  if (term.currency.toUpperCase() !== snapshot.currency.toUpperCase()) {
    throwPayloadMismatch();
  }
  if (term.billingPeriod !== snapshot.billingPeriod) {
    throwPayloadMismatch();
  }
  if (term.priceKind !== snapshot.priceKind) {
    throwPayloadMismatch();
  }
  if (term.seatMin !== snapshot.seatMin) {
    throwPayloadMismatch();
  }
  const termSeatMax = term.seatMax ?? null;
  const snapSeatMax = snapshot.seatMax ?? null;
  if (termSeatMax !== snapSeatMax) {
    throwPayloadMismatch();
  }
  if (toInstantMs(term.effectiveFrom) !== toInstantMs(snapshot.effectiveFrom)) {
    throwPayloadMismatch();
  }
  const termEnd = term.effectiveTo ? toInstantMs(term.effectiveTo) : null;
  const snapEnd = snapshot.effectiveTo ? toInstantMs(snapshot.effectiveTo) : null;
  if (termEnd !== snapEnd) {
    throwPayloadMismatch();
  }
  if (normalizeUuid(term.billingPlanPriceId) !== normalizeUuid(snapshot.billingPlanPriceId)) {
    throwPayloadMismatch();
  }
  if (normalizeOptionalText(term.commercialReference) !== normalizeOptionalText(snapshot.commercialReference)) {
    throwPayloadMismatch();
  }
  const termBenefit = commercialBenefitIdentityFromTerm(term);
  const snapBenefit = snapshot.commercialBenefit;
  if (termBenefit || snapBenefit) {
    const expected = benefitIdentityForDigest(snapBenefit);
    const actual = benefitIdentityForDigest(termBenefit);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throwPayloadMismatch();
    }
  }
};