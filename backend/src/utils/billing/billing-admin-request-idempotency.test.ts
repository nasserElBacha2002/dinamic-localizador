import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../errors/app-error";
import {
  assertExistingTermMatchesSnapshot,
  assertExistingSubscriptionCreateMatchesSnapshot,
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
            createdByUserId: null,
            adminRequestKey: "k1",
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
          createdByUserId: null,
          adminRequestKey: "idem",
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
});