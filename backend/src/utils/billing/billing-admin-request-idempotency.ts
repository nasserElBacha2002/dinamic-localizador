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
};

export const assertExistingSubscriptionCreateMatchesSnapshot = (
  subscription: BillingSubscription,
  terms: BillingSubscriptionTerm[],
  termAdminRequestKey: string,
  snapshot: AdminSubscriptionCreateSnapshot,
): BillingSubscriptionTerm | null => {
  if (normalizeUuid(subscription.companyId) !== normalizeUuid(snapshot.companyId)) {
    throwPayloadMismatch();
  }
  if (normalizeUuid(subscription.billingPlanId) !== normalizeUuid(snapshot.billingPlanId)) {
    throwPayloadMismatch();
  }
  if (
    normalizeUuid(subscription.billingPlanTierId) !== normalizeUuid(snapshot.billingPlanTierId)
  ) {
    throwPayloadMismatch();
  }
  if (subscription.subscriptionStatus !== snapshot.subscriptionStatus) {
    throwPayloadMismatch();
  }
  if (toInstantMs(subscription.effectiveFrom) !== toInstantMs(snapshot.subscriptionEffectiveFrom)) {
    throwPayloadMismatch();
  }
  const subEnd = subscription.effectiveTo ? toInstantMs(subscription.effectiveTo) : null;
  const snapSubEnd = snapshot.subscriptionEffectiveTo
    ? toInstantMs(snapshot.subscriptionEffectiveTo)
    : null;
  if (subEnd !== snapSubEnd) {
    throwPayloadMismatch();
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
  });

  return term;
};

export const assertExistingTermMatchesSnapshot = (
  term: BillingSubscriptionTerm,
  snapshot: AdminContractualTermSnapshot,
): void => {
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
};