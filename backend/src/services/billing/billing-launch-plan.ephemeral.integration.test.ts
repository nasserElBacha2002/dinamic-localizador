/**
 * DIN-406 Fase 2A — launch plan catalog on ephemeral SQL Server (create → prove → destroy).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  BILLING_LAUNCH_INCLUDED_SEAT_MAX,
  BILLING_LAUNCH_PLAN_CODE,
} from "../../constants/billing-launch-plan";
import { PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS } from "../../constants/billing-company-exemption";
import { getPool } from "../../database/connection";
import { randomUUID } from "node:crypto";
import { isDatabaseIntegrationEnabled } from "../../test-helpers/integration-test";
import {
  activateEphemeralBillingExemptionDatabase,
  createEphemeralBillingExemptionDatabase,
  destroyEphemeralBillingExemptionDatabase,
  type EphemeralBillingExemptionHandle,
} from "../../test-helpers/ephemeral-billing-exemption-database";
import { seedProtectedStrategicCompanyExemptions } from "./billing-company-exemption.seed";
import { billingCatalogService } from "./billing-catalog.service";
import { billingPlanRepository } from "../../repositories/billing/billing-plan.repository";
import { billingCommercialAdminService } from "./billing-commercial-admin.service";
import {
  BillingLaunchPlanSeedError,
  seedBillingLaunchPlan,
} from "./billing-launch-plan.seed";
import { billingPolicyService } from "./billing-policy.service";
import { billingSubscriptionService } from "./billing-subscription.service";
import { AppError } from "../../errors/app-error";
import {
  agreedAmountMatchesLaunchFixedPrice,
  isLaunchFixedMonthlyAmount,
  requiresNegotiatedSeatCapacity,
} from "../../utils/billing/launch-plan-contract";
import { normalizeDecimalString } from "../../utils/money-decimal";

const ephemeralEnabled =
  isDatabaseIntegrationEnabled() && process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED === "true";
const describeEphemeral = ephemeralEnabled ? describe : describe.skip;

const seedDisposableCompany = async (name: string): Promise<string> => {
  const companyId = randomUUID();
  await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("name", sql.NVarChar(200), name)
    .query(`
      INSERT INTO dbo.companies (id, name, default_timezone, status)
      VALUES (@companyId, @name, N'America/Argentina/Buenos_Aires', N'ACTIVE');
    `);
  return companyId;
};

const countOpenPricesForTier = async (tierId: string): Promise<number> => {
  const result = await getPool()
    .request()
    .input("tierId", sql.UniqueIdentifier, tierId)
    .query(`
      SELECT COUNT(*) AS c
      FROM dbo.billing_plan_prices
      WHERE billing_plan_tier_id = @tierId
        AND effective_to IS NULL
        AND price_kind = N'REGULAR'
    `);
  return Number(result.recordset[0].c);
};

describeEphemeral("billing launch plan ephemeral SQL proofs", () => {
  let ephemeral: EphemeralBillingExemptionHandle;
  let launchTierId: string;
  let launchPlanId: string;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);

    const first = await seedBillingLaunchPlan({ strictInitialPrice: true });
    launchPlanId = first.planId;
    launchTierId = first.tierId;
    assert.equal(first.planInserted, true);
    assert.equal(first.tierInserted, true);
    assert.equal(first.priceInserted, true);
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
    assert.equal(ephemeral.evidence.destroyed, true);
  });

  it("exposes a single public launch plan for new subscriptions", async () => {
    const publicPlans = await billingCommercialAdminService.listPlansAvailableForNewPublicSubscription();
    assert.equal(publicPlans.length, 1);
    assert.equal(publicPlans[0]?.planCode, BILLING_LAUNCH_PLAN_CODE);
    assert.equal(publicPlans[0]?.tiers.length, 1);
    assert.equal(publicPlans[0]?.tiers[0]?.seatMax, BILLING_LAUNCH_INCLUDED_SEAT_MAX);
  });

  it("seeds launch catalog with USD 300 monthly REGULAR open price", async () => {
    const snapshot = await billingCommercialAdminService.getLaunchPlanSnapshot();
    assert.ok(snapshot);
    assert.ok(snapshot.currentRegularPrice);
    assert.equal(snapshot.includedTier.seatMin, 1);
    assert.equal(snapshot.includedTier.seatMax, 100);
    assert.equal(isLaunchFixedMonthlyAmount(snapshot.currentRegularPrice.amount), true);
  });

  it("is idempotent and does not duplicate open price versions", async () => {
    const second = await seedBillingLaunchPlan();
    const third = await seedBillingLaunchPlan();

    assert.equal(second.skippedExistingPlan, true);
    assert.equal(second.skippedExistingTier, true);
    assert.equal(second.skippedExistingOpenPrice, true);
    assert.equal(third.priceInserted, false);
    assert.equal(await countOpenPricesForTier(launchTierId), 1);
  });

  it("keeps fixed USD 300 for 60 and 100 seats without per-seat pricing", async () => {
    assert.equal(agreedAmountMatchesLaunchFixedPrice("300.000000", 60), true);
    assert.equal(agreedAmountMatchesLaunchFixedPrice("300.000000", 100), true);
    const snapshot = await billingCommercialAdminService.getLaunchPlanSnapshot();
    assert.ok(snapshot?.includedTier.seatMax);
    assert.equal(requiresNegotiatedSeatCapacity(101, snapshot.includedTier.seatMax), true);
  });

  it("preserves subscription agreed amount when public catalog price changes", async () => {
    const companyId = await seedDisposableCompany(`Launch Plan Co ${Date.now()}`);

    const effectiveFrom = new Date("2026-02-01T00:00:00.000Z");
    const created = await billingSubscriptionService.createAdminSubscription({
      companyId,
      billingPlanId: launchPlanId,
      billingPlanTierId: launchTierId,
      effectiveFrom,
      initialTerms: {
        agreedAmount: "300.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        seatMin: 1,
        seatMax: 100,
        effectiveFrom,
      },
    });

    await billingCatalogService.publishPriceVersion({
      billingPlanTierId: launchTierId,
      amount: "350.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      priceKind: "REGULAR",
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
    });

    const terms = await billingSubscriptionService.getCurrentTerms(created.id);
    assert.ok(terms);
    assert.equal(normalizeDecimalString(terms.agreedAmount), "300");

    const history = await billingCommercialAdminService.listTierPriceHistory(launchTierId);
    assert.equal(history.length >= 2, true);
    const closed = history.find((row) => row.effectiveTo !== null);
    assert.ok(closed);
    assert.equal(normalizeDecimalString(closed?.amount ?? ""), "300");
  });

  it("does not auto-advance subscriptions after a twelve-month elapsed window", async () => {
    const companyId = await seedDisposableCompany(`No Promo Cycle Co ${Date.now()}`);
    const effectiveFrom = new Date("2026-02-01T00:00:00.000Z");
    const created = await billingSubscriptionService.createAdminSubscription({
      companyId,
      billingPlanId: launchPlanId,
      billingPlanTierId: launchTierId,
      effectiveFrom,
      initialTerms: {
        agreedAmount: "300.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        priceKind: "REGULAR",
        seatMin: 1,
        seatMax: 100,
        effectiveFrom,
      },
    });

    const afterTwelveMonths = await billingSubscriptionService.getCurrentTerms(
      created.id,
      new Date("2027-06-01T00:00:00.000Z"),
    );
    assert.ok(afterTwelveMonths);
    assert.equal(normalizeDecimalString(afterTwelveMonths.agreedAmount), "300");
    assert.equal(afterTwelveMonths.priceKind, "REGULAR");
  });

  it("stores negotiated capacity above 100 on explicit contractual terms", async () => {
    const customPlan = await billingCatalogService.createPlan({
      planCode: "ENTERPRISE_NEG",
      displayName: "Enterprise negociado",
      planKind: "CUSTOM",
    });
    const companyId = await seedDisposableCompany(`Negotiated Capacity Co ${Date.now()}`);
    const effectiveFrom = new Date("2026-03-01T00:00:00.000Z");
    await billingSubscriptionService.createAdminSubscription({
      companyId,
      billingPlanId: customPlan.id,
      billingPlanTierId: null,
      effectiveFrom,
      initialTerms: {
        agreedAmount: "1850.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        seatMin: 101,
        seatMax: 180,
        effectiveFrom,
      },
    });

    const negotiated = await billingCommercialAdminService.findCustomPlanSubscriptions(
      new Date("2026-06-01T00:00:00.000Z"),
    );
    const match = negotiated.find(
      (row) => row.companyId.toUpperCase() === companyId.toUpperCase(),
    );
    assert.ok(match, `expected negotiated subscription row for ${companyId}`);
    assert.equal(match?.seatMax, 180);
  });

  it("keeps strategic companies exempt after launch catalog and exemptions seed", async () => {
    await seedProtectedStrategicCompanyExemptions();
    for (const entry of PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS) {
      const policy = await billingPolicyService.getCompanyBillingPolicy(entry.companyId);
      assert.equal(policy.isExempt, true);
      assert.equal(policy.requiresPayment, false);
      assert.equal(policy.enforceSeatLimit, false);
      assert.equal(policy.allowCommercialSuspension, false);
    }
  });

  it("allows legacy standard plans without public-offering enforcement", async () => {
    const legacyPlan = await billingCatalogService.createPlan({
      planCode: `LEGACY_STD_${Date.now().toString(36)}`,
      displayName: "Legacy standard",
      planKind: "STANDARD",
      isActive: true,
    });
    const legacyTier = await billingCatalogService.createTier(legacyPlan.id, {
      tierCode: "L50",
      displayName: "Hasta 50",
      seatMin: 1,
      seatMax: 50,
    });
    const companyId = await seedDisposableCompany(`Legacy standard Co ${Date.now()}`);
    const effectiveFrom = new Date("2026-04-01T00:00:00.000Z");

    const created = await billingSubscriptionService.createAdminSubscription({
      companyId,
      billingPlanId: legacyPlan.id,
      billingPlanTierId: legacyTier.id,
      effectiveFrom,
      initialTerms: {
        agreedAmount: "77.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        effectiveFrom,
      },
    });
    assert.ok(created.id);
  });

  it("rejects incompatible standard launch subscription amounts using persisted catalog prices", async () => {
    const companyId = await seedDisposableCompany(`Contract policy Co ${Date.now()}`);
    const effectiveFrom = new Date("2026-05-01T00:00:00.000Z");

    await assert.rejects(
      () =>
        billingSubscriptionService.createAdminSubscription({
          companyId,
          billingPlanId: launchPlanId,
          billingPlanTierId: launchTierId,
          effectiveFrom,
          initialTerms: {
            agreedAmount: "180.000000",
            currency: "USD",
            billingPeriod: "MONTHLY",
            effectiveFrom,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_CATALOG_AMOUNT_MISMATCH");
        return true;
      },
    );
  });

  it("rejects public standard subscriptions that reference a catalog price but agree an unauthorized amount", async () => {
    const companyId = await seedDisposableCompany(`Price id bypass Co ${Date.now()}`);
    const effectiveFrom = new Date("2026-05-01T00:00:00.000Z");
    const snapshot = await billingCommercialAdminService.getLaunchPlanSnapshot(effectiveFrom);
    assert.ok(snapshot?.currentRegularPrice?.id);

    await assert.rejects(
      () =>
        billingSubscriptionService.createAdminSubscription({
          companyId,
          billingPlanId: launchPlanId,
          billingPlanTierId: launchTierId,
          effectiveFrom,
          initialTerms: {
            agreedAmount: "180.000000",
            currency: "USD",
            billingPeriod: "MONTHLY",
            billingPlanPriceId: snapshot.currentRegularPrice?.id,
            effectiveFrom,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_CATALOG_AMOUNT_MISMATCH");
        return true;
      },
    );
  });

  it("preserves legacy plans without exposing them for new public subscriptions", async () => {
    const legacyPlan = await billingCatalogService.createPlan({
      planCode: "STARTER_LEGACY",
      displayName: "Starter legacy",
      planKind: "STANDARD",
      isActive: true,
    });
    await billingCatalogService.createTier(legacyPlan.id, {
      tierCode: "S25",
      displayName: "Starter hasta 25",
      seatMin: 1,
      seatMax: 25,
    });

    await seedBillingLaunchPlan();
    const publicPlans = await billingCommercialAdminService.listPlansAvailableForNewPublicSubscription();
    assert.equal(publicPlans.length, 1);
    assert.equal(publicPlans[0]?.planCode, BILLING_LAUNCH_PLAN_CODE);

    const legacy = await billingCommercialAdminService.listCommercialCatalog({ activeOnly: true });
    assert.ok(legacy.some((entry) => entry.planCode === "STARTER_LEGACY"));
  });
});

describeEphemeral("billing launch plan admin price idempotency (isolated)", () => {
  let ephemeral: EphemeralBillingExemptionHandle;
  let launchTierId: string;
  let launchPlanId: string;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
    const seeded = await seedBillingLaunchPlan({ strictInitialPrice: true });
    launchTierId = seeded.tierId;
    launchPlanId = seeded.planId;
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
  });

  it("remains idempotent after admin publishes USD 350 as current open price", async () => {
    await billingCatalogService.publishPriceVersion({
      billingPlanTierId: launchTierId,
      amount: "350.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      priceKind: "REGULAR",
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
    });

    const afterAdmin = await seedBillingLaunchPlan();
    assert.equal(afterAdmin.skippedExistingOpenPrice, true);
    assert.equal(afterAdmin.priceInserted, false);
    assert.equal(await countOpenPricesForTier(launchTierId), 1);

    const snapshot = await billingCommercialAdminService.getLaunchPlanSnapshot(
      new Date("2026-07-01T00:00:00.000Z"),
    );
    assert.equal(normalizeDecimalString(snapshot?.currentRegularPrice?.amount ?? ""), "350");
  });

  it("keeps contracts at 300 when catalog open price is 350 and idempotent seed runs", async () => {
    const companyId = await seedDisposableCompany(`Idempotent 350 Co ${Date.now()}`);
    const effectiveFrom = new Date("2026-02-01T00:00:00.000Z");
    const created = await billingSubscriptionService.createAdminSubscription({
      companyId,
      billingPlanId: launchPlanId,
      billingPlanTierId: launchTierId,
      effectiveFrom,
      initialTerms: {
        agreedAmount: "300.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        seatMin: 1,
        seatMax: 100,
        effectiveFrom,
      },
    });
    await seedBillingLaunchPlan();
    const terms = await billingSubscriptionService.getCurrentTerms(created.id);
    assert.equal(normalizeDecimalString(terms?.agreedAmount ?? ""), "300");
    assert.ok(created.id);
  });
});

describeEphemeral("billing launch plan catalog integrity rejects (isolated)", () => {
  let ephemeral: EphemeralBillingExemptionHandle;
  let launchTierId: string;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
    const seeded = await seedBillingLaunchPlan({ strictInitialPrice: true });
    launchTierId = seeded.tierId;
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
  });

  it("rejects seed when historical prices exist without an open regular row", async () => {
    await getPool()
      .request()
      .input("tierId", sql.UniqueIdentifier, launchTierId)
      .query(`
        UPDATE dbo.billing_plan_prices
        SET effective_to = SYSUTCDATETIME()
        WHERE billing_plan_tier_id = @tierId
          AND effective_to IS NULL
          AND price_kind = N'REGULAR'
      `);

    await assert.rejects(
      () => seedBillingLaunchPlan({ strictInitialPrice: true }),
      (error: unknown) => {
        assert.ok(error instanceof BillingLaunchPlanSeedError);
        return true;
      },
    );
  });
});

describeEphemeral("billing launch plan public capacity changes (isolated)", () => {
  let ephemeral: EphemeralBillingExemptionHandle;
  let launchTierId: string;
  let launchPlanId: string;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
    const seeded = await seedBillingLaunchPlan({ strictInitialPrice: true });
    launchTierId = seeded.tierId;
    launchPlanId = seeded.planId;
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
  });

  it("preserves contractual seat_max when public catalog capacity changes to 150", async () => {
    const companyId = await seedDisposableCompany(`Capacity drift Co ${Date.now()}`);
    const effectiveFrom = new Date("2026-02-15T00:00:00.000Z");
    const created = await billingSubscriptionService.createAdminSubscription({
      companyId,
      billingPlanId: launchPlanId,
      billingPlanTierId: launchTierId,
      effectiveFrom,
      initialTerms: {
        agreedAmount: "300.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        seatMin: 1,
        seatMax: 100,
        effectiveFrom,
      },
    });

    await billingCatalogService.updateTier(launchTierId, {
      seatMax: 150,
      displayName: "Hasta 150 colaboradores",
    });

    const terms = await billingSubscriptionService.getCurrentTerms(created.id);
    assert.equal(terms?.seatMax, 100);
    const snapshot = await billingCommercialAdminService.getLaunchPlanSnapshot();
    assert.equal(snapshot?.includedTier.seatMax, 150);
    assert.equal(
      requiresNegotiatedSeatCapacity(120, snapshot?.includedTier.seatMax ?? null),
      false,
    );
    assert.ok(created.id);
  });
});

describeEphemeral("billing launch plan admin unpublish preserved (isolated)", () => {
  let ephemeral: EphemeralBillingExemptionHandle;
  let launchPlanId: string;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
    const seeded = await seedBillingLaunchPlan({ strictInitialPrice: true });
    launchPlanId = seeded.planId;
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
  });

  it("does not republish LANZAMIENTO after an administrator unpublishes it", async () => {
    await billingCommercialAdminService.setPlanPublicForNewSubscription(launchPlanId, false);
    const result = await seedBillingLaunchPlan();
    const plan = await billingPlanRepository.findByCode(BILLING_LAUNCH_PLAN_CODE);
    assert.ok(plan);
    assert.equal(plan.isPublicForNewSubscription, false);
    assert.equal(result.publicOfferingEnabled, false);
    const publicPlans = await billingCommercialAdminService.listPlansAvailableForNewPublicSubscription();
    assert.equal(publicPlans.length, 0);
  });
});

describeEphemeral("billing launch plan public price requirement (isolated)", () => {
  let ephemeral: EphemeralBillingExemptionHandle;
  let launchPlanId: string;
  let launchTierId: string;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
    const seeded = await seedBillingLaunchPlan({ strictInitialPrice: true });
    launchPlanId = seeded.planId;
    launchTierId = seeded.tierId;
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
  });

  it("rejects new public standard subscriptions when no applicable catalog price exists at term date", async () => {
    const catalogClosedBeforeTerm = new Date("2026-01-15T00:00:00.000Z");
    await getPool()
      .request()
      .input("tierId", sql.UniqueIdentifier, launchTierId)
      .input("closedAt", sql.DateTime2, catalogClosedBeforeTerm)
      .query(`
        UPDATE dbo.billing_plan_prices
        SET effective_to = @closedAt
        WHERE billing_plan_tier_id = @tierId
          AND effective_to IS NULL
          AND price_kind = N'REGULAR'
      `);

    const companyId = await seedDisposableCompany(`No public price Co ${Date.now()}`);
    const effectiveFrom = new Date("2026-02-01T00:00:00.000Z");

    await assert.rejects(
      () =>
        billingSubscriptionService.createAdminSubscription({
          companyId,
          billingPlanId: launchPlanId,
          billingPlanTierId: launchTierId,
          effectiveFrom,
          initialTerms: {
            agreedAmount: "300.000000",
            currency: "USD",
            billingPeriod: "MONTHLY",
            effectiveFrom,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_CATALOG_PRICE_UNAVAILABLE");
        return true;
      },
    );
  });
});

describeEphemeral("billing launch plan strict structure validation (isolated)", () => {
  let ephemeral: EphemeralBillingExemptionHandle;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
    await seedBillingLaunchPlan({ strictInitialPrice: true });
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
  });

  it("rejects strict seed when launch tier capacity was administratively changed", async () => {
    const snapshot = await billingCommercialAdminService.getLaunchPlanSnapshot();
    assert.ok(snapshot);

    await billingCatalogService.updateTier(snapshot.includedTier.id, { seatMax: 80 });

    await assert.rejects(
      () => seedBillingLaunchPlan({ strictInitialPrice: true }),
      (error: unknown) => {
        assert.ok(error instanceof BillingLaunchPlanSeedError);
        return true;
      },
    );
  });
});