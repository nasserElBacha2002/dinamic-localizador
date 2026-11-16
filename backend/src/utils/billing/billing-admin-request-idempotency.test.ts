import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../errors/app-error";
import {
  assertExistingTermMatchesSnapshot,
  assertExistingSubscriptionCreateMatchesSnapshot,
  computeAdminContractualTermDigest,
} from "./billing-admin-request-idempotency";

describe("billing admin request idempotency", () => {
  it("rejects mismatched monetary amounts without floating conversions", () => {
    assert.throws(
      () =>
        assertExistingTermMatchesSnapshot(
          {
            id: "term-1",
            billingSubscriptionId: "sub-1",
            agreedAmount: "300.000000",
            currency: "USD",
            billingPeriod: "MONTHLY",
            priceKind: "REGULAR",
            seatMin: 1,
            seatMax: 100,
            billingPlanId: null,
            billingPlanTierId: null,
            billingPlanPriceId: null,
            effectiveFrom: "2026-01-01T00:00:00.000Z",
            effectiveTo: null,
            cancelledAt: null,
            commercialReference: null,
            commercialBenefitKind: null,
            commercialBenefitBaseAmount: null,
            commercialBenefitDiscountPercent: null,
            commercialBenefitDiscountAmount: null,
            commercialBenefitReason: null,
            createdByUserId: null,
            adminRequestKey: "k1",
            adminRequestIdempotencyDigest: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            operation: "REGISTER_TERMS",
            subscriptionId: "sub-1",
            agreedAmount: "350.000000",
            currency: "USD",
            billingPeriod: "MONTHLY",
            priceKind: "REGULAR",
            seatMin: 1,
            seatMax: 100,
            effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
            effectiveTo: null,
            billingPlanPriceId: null,
            commercialReference: null,
            commercialBenefit: null,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_ADMIN_REQUEST_PAYLOAD_MISMATCH");
        return true;
      },
    );
  });

  it("accepts decimal-equivalent agreed amounts", () => {
    const matched = assertExistingSubscriptionCreateMatchesSnapshot(
      {
        id: "sub-1",
        companyId: "co-1",
        billingPlanId: "plan-1",
        billingPlanTierId: "tier-1",
        subscriptionStatus: "ACTIVE",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        endedAt: null,
        adminRequestKey: "idem",
        adminRequestIdempotencyDigest: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      [
        {
          id: "term-1",
          billingSubscriptionId: "sub-1",
          agreedAmount: "300.000000",
          currency: "USD",
          billingPeriod: "MONTHLY",
          priceKind: "REGULAR",
          seatMin: 1,
          seatMax: 100,
          billingPlanId: "plan-1",
          billingPlanTierId: "tier-1",
          billingPlanPriceId: null,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveTo: null,
          cancelledAt: null,
          commercialReference: null,
          commercialBenefitKind: null,
          commercialBenefitBaseAmount: null,
          commercialBenefitDiscountPercent: null,
          commercialBenefitDiscountAmount: null,
          commercialBenefitReason: null,
          createdByUserId: null,
          adminRequestKey: "idem",
          adminRequestIdempotencyDigest: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      "idem",
      {
        operation: "CREATE_SUBSCRIPTION",
        companyId: "co-1",
        billingPlanId: "plan-1",
        billingPlanTierId: "tier-1",
        subscriptionStatus: "ACTIVE",
        subscriptionEffectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        subscriptionEffectiveTo: null,
        agreedAmount: "300",
        currency: "USD",
        billingPeriod: "MONTHLY",
        priceKind: "REGULAR",
        seatMin: 1,
        seatMax: 100,
        termEffectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        termEffectiveTo: null,
        billingPlanPriceId: null,
      },
    );
    assert.ok(matched);
  });

  it("accepts digest replay when effective_to was closed by later versions", () => {
    const snapshot = {
      operation: "REGISTER_TERMS" as const,
      subscriptionId: "sub-1",
      agreedAmount: "300.000000",
      currency: "USD",
      billingPeriod: "MONTHLY" as const,
      priceKind: "REGULAR" as const,
      seatMin: 1,
      seatMax: 100,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
      billingPlanPriceId: null,
      commercialReference: "DIN406_BENEFIT",
      commercialBenefit: {
        kind: "PERCENT_DISCOUNT",
        baseAmount: "300",
        discountPercent: "10",
        discountAmount: null,
        reason: "Promo",
      },
    };
    const digest = computeAdminContractualTermDigest(snapshot);
    assert.doesNotThrow(() =>
      assertExistingTermMatchesSnapshot(
        {
          id: "term-1",
          billingSubscriptionId: "sub-1",
          agreedAmount: "300.000000",
          currency: "USD",
          billingPeriod: "MONTHLY",
          priceKind: "REGULAR",
          seatMin: 1,
          seatMax: 100,
          billingPlanId: null,
          billingPlanTierId: null,
          billingPlanPriceId: null,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveTo: "2027-12-01T00:00:00.000Z",
          cancelledAt: null,
          commercialReference: "DIN406_BENEFIT",
          commercialBenefitKind: "PERCENT_DISCOUNT",
          commercialBenefitBaseAmount: "300",
          commercialBenefitDiscountPercent: "10",
          commercialBenefitDiscountAmount: null,
          commercialBenefitReason: "Promo",
          createdByUserId: null,
          adminRequestKey: "k1",
          adminRequestIdempotencyDigest: digest,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        snapshot,
      ),
    );
  });

  it("rejects same final amount when commercial benefit identity differs", () => {
    const baseSnapshot = {
      operation: "REGISTER_TERMS" as const,
      subscriptionId: "sub-1",
      agreedAmount: "270",
      currency: "USD",
      billingPeriod: "MONTHLY" as const,
      priceKind: "PROMOTIONAL" as const,
      seatMin: 1,
      seatMax: 100,
      effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
      effectiveTo: null,
      billingPlanPriceId: null,
      commercialReference: "DIN406_BENEFIT",
      commercialBenefit: {
        kind: "PERCENT_DISCOUNT",
        baseAmount: "300",
        discountPercent: "10",
        discountAmount: null,
        reason: "Promo A",
      },
    };
    const digest = computeAdminContractualTermDigest(baseSnapshot);
    assert.throws(
      () =>
        assertExistingTermMatchesSnapshot(
          {
            id: "term-2",
            billingSubscriptionId: "sub-1",
            agreedAmount: "270",
            currency: "USD",
            billingPeriod: "MONTHLY",
            priceKind: "PROMOTIONAL",
            seatMin: 1,
            seatMax: 100,
            billingPlanId: null,
            billingPlanTierId: null,
            billingPlanPriceId: null,
            effectiveFrom: "2026-04-01T00:00:00.000Z",
            effectiveTo: null,
            cancelledAt: null,
            commercialReference: "DIN406_BENEFIT",
            commercialBenefitKind: "FIXED_AMOUNT_DISCOUNT",
            commercialBenefitBaseAmount: "300",
            commercialBenefitDiscountPercent: null,
            commercialBenefitDiscountAmount: "30",
            commercialBenefitReason: "Promo B",
            createdByUserId: null,
            adminRequestKey: "k2",
            adminRequestIdempotencyDigest: digest,
            createdAt: "2026-04-01T00:00:00.000Z",
          },
          {
            ...baseSnapshot,
            commercialBenefit: {
              kind: "FIXED_AMOUNT_DISCOUNT",
              baseAmount: "300",
              discountPercent: null,
              discountAmount: "30",
              reason: "Promo B",
            },
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_ADMIN_REQUEST_PAYLOAD_MISMATCH");
        return true;
      },
    );
  });
});