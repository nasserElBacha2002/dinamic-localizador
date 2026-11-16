import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BillingSubscriptionStatus } from "../../constants/billing-subscription";
import type { BillingSubscriptionTerm } from "../../types/billing-subscription";
import { termHasAgreedContractualSuccessor } from "./billing-commercial-benefit.service";

const term = (overrides: Partial<BillingSubscriptionTerm> & Pick<BillingSubscriptionTerm, "id" | "effectiveFrom">): BillingSubscriptionTerm => ({
  billingSubscriptionId: "sub-1",
  agreedAmount: "300",
  currency: "USD",
  billingPeriod: "MONTHLY",
  priceKind: "PROMOTIONAL",
  seatMin: 1,
  seatMax: 100,
  billingPlanId: null,
  billingPlanTierId: null,
  billingPlanPriceId: null,
  effectiveTo: null,
  cancelledAt: null,
  commercialReference: "DIN406_BENEFIT",
  commercialBenefitKind: "PERCENT_DISCOUNT",
  commercialBenefitBaseAmount: "300",
  commercialBenefitDiscountPercent: "10",
  commercialBenefitDiscountAmount: null,
  commercialBenefitReason: "Promo",
  createdByUserId: null,
  adminRequestKey: null,
  adminRequestIdempotencyDigest: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const statusMap = (entries: Record<string, BillingSubscriptionStatus>): Map<string, BillingSubscriptionStatus> =>
  new Map(Object.entries(entries));

describe("commercial benefit contractual successor", () => {
  it("requires a non-cancelled term starting exactly when the benefit ends", () => {
    const benefit = term({
      id: "benefit-1",
      effectiveFrom: "2027-05-01T00:00:00.000Z",
      effectiveTo: "2027-08-01T00:00:00.000Z",
    });
    const successor = term({
      id: "successor-1",
      billingSubscriptionId: "sub-2",
      effectiveFrom: "2027-08-01T00:00:00.000Z",
      priceKind: "REGULAR",
      commercialReference: null,
      commercialBenefitKind: null,
      commercialBenefitBaseAmount: null,
      commercialBenefitDiscountPercent: null,
      commercialBenefitDiscountAmount: null,
      commercialBenefitReason: null,
    });
    assert.equal(
      termHasAgreedContractualSuccessor(
        benefit,
        [benefit, successor],
        statusMap({ "sub-1": "ACTIVE", "sub-2": "ACTIVE" }),
      ),
      true,
    );
  });

  it("accepts a scheduled successor subscription at the transition instant", () => {
    const benefit = term({
      id: "benefit-1b",
      effectiveFrom: "2027-05-01T00:00:00.000Z",
      effectiveTo: "2027-08-01T00:00:00.000Z",
    });
    const successor = term({
      id: "successor-1b",
      billingSubscriptionId: "sub-2",
      effectiveFrom: "2027-08-01T00:00:00.000Z",
      priceKind: "REGULAR",
      commercialReference: null,
      commercialBenefitKind: null,
      commercialBenefitBaseAmount: null,
      commercialBenefitDiscountPercent: null,
      commercialBenefitDiscountAmount: null,
      commercialBenefitReason: null,
    });
    assert.equal(
      termHasAgreedContractualSuccessor(
        benefit,
        [benefit, successor],
        statusMap({ "sub-1": "ACTIVE", "sub-2": "SCHEDULED" }),
      ),
      true,
    );
  });

  it("does not infer successor from another subscription start date alone", () => {
    const benefit = term({
      id: "benefit-2",
      effectiveFrom: "2027-05-01T00:00:00.000Z",
      effectiveTo: "2027-08-01T00:00:00.000Z",
    });
    const unrelated = term({
      id: "other-1",
      billingSubscriptionId: "sub-2",
      effectiveFrom: "2027-04-01T00:00:00.000Z",
      priceKind: "REGULAR",
      commercialReference: null,
      commercialBenefitKind: null,
      commercialBenefitBaseAmount: null,
      commercialBenefitDiscountPercent: null,
      commercialBenefitDiscountAmount: null,
      commercialBenefitReason: null,
    });
    assert.equal(
      termHasAgreedContractualSuccessor(
        benefit,
        [benefit, unrelated],
        statusMap({ "sub-1": "ACTIVE", "sub-2": "ACTIVE" }),
      ),
      false,
    );
  });

  it("ignores cancelled successors at the transition instant", () => {
    const benefit = term({
      id: "benefit-3",
      effectiveFrom: "2027-05-01T00:00:00.000Z",
      effectiveTo: "2027-08-01T00:00:00.000Z",
    });
    const cancelled = term({
      id: "cancelled-1",
      effectiveFrom: "2027-08-01T00:00:00.000Z",
      cancelledAt: "2027-08-01T12:00:00.000Z",
      priceKind: "REGULAR",
      commercialReference: null,
      commercialBenefitKind: null,
      commercialBenefitBaseAmount: null,
      commercialBenefitDiscountPercent: null,
      commercialBenefitDiscountAmount: null,
      commercialBenefitReason: null,
    });
    assert.equal(
      termHasAgreedContractualSuccessor(
        benefit,
        [benefit, cancelled],
        statusMap({ "sub-1": "ACTIVE" }),
      ),
      false,
    );
  });

  it("ignores successor terms on ended or cancelled subscriptions", () => {
    const benefit = term({
      id: "benefit-4",
      effectiveFrom: "2027-05-01T00:00:00.000Z",
      effectiveTo: "2027-08-01T00:00:00.000Z",
    });
    const successor = term({
      id: "successor-4",
      billingSubscriptionId: "sub-ended",
      effectiveFrom: "2027-08-01T00:00:00.000Z",
      priceKind: "REGULAR",
      commercialReference: null,
      commercialBenefitKind: null,
      commercialBenefitBaseAmount: null,
      commercialBenefitDiscountPercent: null,
      commercialBenefitDiscountAmount: null,
      commercialBenefitReason: null,
    });
    assert.equal(
      termHasAgreedContractualSuccessor(
        benefit,
        [benefit, successor],
        statusMap({ "sub-1": "ACTIVE", "sub-ended": "ENDED" }),
      ),
      false,
    );
    assert.equal(
      termHasAgreedContractualSuccessor(
        benefit,
        [benefit, successor],
        statusMap({ "sub-1": "ACTIVE", "sub-ended": "CANCELLED" }),
      ),
      false,
    );
  });
});