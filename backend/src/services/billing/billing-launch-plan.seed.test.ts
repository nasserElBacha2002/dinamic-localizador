import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BillingPlan, BillingPlanTier } from "../../types/billing-catalog";
import {
  BillingLaunchPlanSeedError,
  LAUNCH_PLAN_STRUCTURE_EXPECTATION,
  validateExistingLaunchPlanStructure,
  validateOpenLaunchRegularPrice,
} from "./billing-launch-plan.seed";

const planFixture = (overrides?: Partial<BillingPlan>): BillingPlan => ({
  id: "00000000-0000-0000-0000-000000000001",
  planCode: "LANZAMIENTO",
  displayName: "Plan Lanzamiento",
  description: null,
  planKind: "STANDARD",
  sortOrder: 10,
  isActive: true,
  isPublicForNewSubscription: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const tierFixture = (overrides?: Partial<BillingPlanTier>): BillingPlanTier => ({
  id: "00000000-0000-0000-0000-000000000002",
  billingPlanId: "00000000-0000-0000-0000-000000000001",
  tierCode: "INCLUIDO_100",
  displayName: "Hasta 100 colaboradores",
  seatMin: 1,
  seatMax: 100,
  sortOrder: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("billing launch plan seed validators", () => {
  it("accepts a single active included tier", () => {
    const tier = validateExistingLaunchPlanStructure({
      plan: planFixture(),
      tiers: [tierFixture()],
    });
    assert.equal(tier.tierCode, LAUNCH_PLAN_STRUCTURE_EXPECTATION.tierCode);
  });

  it("rejects conflicting active tiers", () => {
    assert.throws(
      () =>
        validateExistingLaunchPlanStructure({
          plan: planFixture(),
          tiers: [tierFixture(), tierFixture({ id: "2", tierCode: "LEGACY_50", seatMax: 50 })],
          enforceInitialTierCapacity: false,
        }),
      (error: unknown) => {
        assert.ok(error instanceof BillingLaunchPlanSeedError);
        return true;
      },
    );
  });

  it("rejects an unexpected open regular launch price during strict seeding", () => {
    assert.throws(
      () =>
        validateOpenLaunchRegularPrice({
          openPrice: {
            id: "p",
            billingPlanTierId: "t",
            amount: "350",
            currency: "USD",
            billingPeriod: "MONTHLY",
            priceKind: "REGULAR",
            effectiveFrom: "2026-01-01T00:00:00.000Z",
            effectiveTo: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          allowAdminModifiedAmount: false,
        }),
      (error: unknown) => {
        assert.ok(error instanceof BillingLaunchPlanSeedError);
        return true;
      },
    );
  });

  it("allows administratively published catalog prices when not strict", () => {
    validateOpenLaunchRegularPrice({
      openPrice: {
        id: "p",
        billingPlanTierId: "t",
        amount: "350.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        priceKind: "REGULAR",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveTo: null,
        createdAt: "2026-06-01T00:00:00.000Z",
      },
      allowAdminModifiedAmount: true,
    });
  });
});