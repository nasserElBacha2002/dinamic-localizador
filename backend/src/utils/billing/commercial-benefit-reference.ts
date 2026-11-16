import {
  COMMERCIAL_BENEFIT_REFERENCE_PREFIX,
  COMMERCIAL_BENEFIT_ROW_MARKER,
  type CommercialBenefitKind,
} from "../../constants/billing-commercial-benefit";
import type { BillingSubscriptionTerm } from "../../types/billing-subscription";
import { formatBenefitAmount } from "./commercial-benefit-decimal";

export type CommercialBenefitReferencePayload = {
  kind: CommercialBenefitKind;
  baseAmount: string;
  finalAmount: string;
  discountPercent?: string | null;
  discountAmount?: string | null;
  reason: string;
  permanent: boolean;
};

export const commercialBenefitRowMarker = (): string => COMMERCIAL_BENEFIT_ROW_MARKER;

export const readCommercialBenefitFromTerm = (
  term: BillingSubscriptionTerm,
): CommercialBenefitReferencePayload | null => {
  if (term.commercialBenefitKind) {
    return {
      kind: term.commercialBenefitKind,
      baseAmount: formatBenefitAmount(term.commercialBenefitBaseAmount ?? term.agreedAmount),
      finalAmount: formatBenefitAmount(term.agreedAmount),
      discountPercent: term.commercialBenefitDiscountPercent,
      discountAmount: term.commercialBenefitDiscountAmount,
      reason: term.commercialBenefitReason ?? "",
      permanent: term.effectiveTo == null,
    };
  }

  const value = term.commercialReference;
  if (!value || !value.startsWith(COMMERCIAL_BENEFIT_REFERENCE_PREFIX)) {
    return null;
  }
  const json = value.slice(COMMERCIAL_BENEFIT_REFERENCE_PREFIX.length);
  try {
    const parsed = JSON.parse(json) as CommercialBenefitReferencePayload;
    if (!parsed || typeof parsed !== "object" || !parsed.kind) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

/** @deprecated use structured columns; kept for legacy decode tests. */
export const decodeCommercialBenefitReference = (
  value: string | null | undefined,
): CommercialBenefitReferencePayload | null => {
  if (!value || !value.startsWith(COMMERCIAL_BENEFIT_REFERENCE_PREFIX)) {
    return null;
  }
  const json = value.slice(COMMERCIAL_BENEFIT_REFERENCE_PREFIX.length);
  try {
    const parsed = JSON.parse(json) as CommercialBenefitReferencePayload;
    if (!parsed || typeof parsed !== "object" || !parsed.kind) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};