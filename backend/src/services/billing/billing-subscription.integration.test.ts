/**
 * DIN-406 Fase 1B — billing subscriptions integration.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import { companyRepository } from "../../repositories/companies/company.repository";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { ensureBillingSubscriptionsMigration } from "../../test-helpers/ensure-billing-subscriptions-migration";
import { createPlatformCompanyFixture } from "../../test-helpers/platform-company-fixture";
import { normalizeDecimalString } from "../../utils/money-decimal";
import { isSqlDeadlockError } from "../../utils/sql-server-errors";
import { billingSubscriptionRepository } from "../../repositories/billing/billing-subscription.repository";
import { billingSubscriptionTermRepository } from "../../repositories/billing/billing-subscription-term.repository";
import { billingCatalogService } from "./billing-catalog.service";
import { billingSubscriptionService } from "./billing-subscription.service";
import {
  splitBatches,
  stripLegacyDatabaseUse,
} from "../../database/run-migrations";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const uniqueSuffix = () => Date.now().toString(36);

const runSqlScriptBatches = async (script: string): Promise<void> => {
  const pool = getPool();
  for (const batch of splitBatches(script)) {
    const normalized = stripLegacyDatabaseUse(batch);
    if (normalized) {
      await pool.request().query(normalized);
    }
  }
};

describeDatabaseIntegration("billing subscription service integration", () => {
  const createdPlanIds: string[] = [];
  const createdCompanyIds: string[] = [];
  const createdSubscriptionIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    await ensureBillingSubscriptionsMigration();
  });

  after(async () => {
    const pool = getPool();
    for (const subscriptionId of createdSubscriptionIds.reverse()) {
      await pool
        .request()
        .input("subscriptionId", sql.UniqueIdentifier, subscriptionId)
        .query(`
          DELETE FROM dbo.billing_subscription_terms WHERE billing_subscription_id = @subscriptionId;
          DELETE FROM dbo.billing_subscriptions WHERE id = @subscriptionId;
        `);
    }
    for (const planId of createdPlanIds.reverse()) {
      await pool
        .request()
        .input("planId", sql.UniqueIdentifier, planId)
        .query(`
          DELETE FROM dbo.billing_plan_prices
          WHERE billing_plan_tier_id IN (
            SELECT id FROM dbo.billing_plan_tiers WHERE billing_plan_id = @planId
          );
          DELETE FROM dbo.billing_plan_tiers WHERE billing_plan_id = @planId;
          DELETE FROM dbo.billing_plans WHERE id = @planId;
        `);
    }
    await teardownDatabaseIntegration();
  });

  const seedPlanWithTier = async () => {
    const plan = await billingCatalogService.createPlan({
      planCode: `SUB-${uniqueSuffix()}`,
      displayName: "Growth test",
      planKind: "STANDARD",
    });
    createdPlanIds.push(plan.id);
    const tier = await billingCatalogService.createTier(plan.id, {
      tierCode: "G100",
      displayName: "Hasta 100",
      seatMin: 51,
      seatMax: 100,
    });
    return { plan, tier };
  };

  const seedCompany = async () => {
    const suffix = uniqueSuffix();
    const fixture = await createPlatformCompanyFixture({
      name: `Billing Sub Co ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Billing Sub Owner",
        email: `billing-sub-${suffix}@test.local`,
      },
    });
    createdCompanyIds.push(fixture.data.company.id);
    return fixture.data.company;
  };

  const createActiveSubscription = async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();
    const effectiveFrom = new Date("2026-01-01T00:00:00.000Z");
    const created = await billingSubscriptionService.createAdminSubscription({
      companyId: company.id,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      subscriptionStatus: "ACTIVE",
      effectiveFrom,
      initialTerms: {
        agreedAmount: "250.500000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        effectiveFrom,
      },
    });
    createdSubscriptionIds.push(created.id);
    return { company, plan, tier, subscription: created };
  };

  it("creates subscription and returns current subscription and terms from SQL", async () => {
    const { company, subscription } = await createActiveSubscription();

    const inPeriod = new Date("2026-06-01T00:00:00.000Z");
    const current = await billingSubscriptionService.getCurrentSubscription(company.id, inPeriod);
    assert.ok(current);
    assert.equal(current?.id, subscription.id);
    const beforePeriod = await billingSubscriptionService.getCurrentSubscription(
      company.id,
      new Date("2025-12-01T00:00:00.000Z"),
    );
    assert.equal(beforePeriod, null);

    const pool = getPool();
    const persisted = await pool
      .request()
      .input("subscriptionId", sql.UniqueIdentifier, subscription.id)
      .query(`
        SELECT subscription_status, agreed_amount
        FROM dbo.billing_subscriptions s
        INNER JOIN dbo.billing_subscription_terms t ON t.billing_subscription_id = s.id
        WHERE s.id = @subscriptionId
      `);
    assert.equal(persisted.recordset.length, 1);
    assert.equal(String(persisted.recordset[0].subscription_status), "ACTIVE");
    assert.equal(
      normalizeDecimalString(String(persisted.recordset[0].agreed_amount)),
      "250.5",
    );

    const history = await billingSubscriptionService.listSubscriptionHistory(company.id);
    assert.equal(history.length, 1);
  });

  it("rejects tier that does not belong to contracted plan", async () => {
    const company = await seedCompany();
    const planA = await billingCatalogService.createPlan({
      planCode: `PLA-${uniqueSuffix()}`,
      displayName: "Plan A",
    });
    const planB = await billingCatalogService.createPlan({
      planCode: `PLB-${uniqueSuffix()}`,
      displayName: "Plan B",
    });
    createdPlanIds.push(planA.id, planB.id);
    const tierB = await billingCatalogService.createTier(planB.id, {
      tierCode: "TB50",
      displayName: "Plan B tier",
      seatMin: 1,
      seatMax: 50,
    });

    await assert.rejects(
      () =>
        billingSubscriptionService.createAdminSubscription({
          companyId: company.id,
          billingPlanId: planA.id,
          billingPlanTierId: tierB.id,
          effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
          initialTerms: {
            agreedAmount: "10",
            currency: "USD",
            billingPeriod: "MONTHLY",
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_TIER_PLAN_MISMATCH");
        return true;
      },
    );

    const count = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, company.id)
      .query(`SELECT COUNT(*) AS c FROM dbo.billing_subscriptions WHERE company_id = @companyId`);
    assert.equal(Number(count.recordset[0].c), 0);
  });

  it("prevents duplicate active subscriptions under concurrency", async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();
    const effectiveFrom = new Date("2026-03-01T00:00:00.000Z");

    const outcomes = await Promise.allSettled([
      billingSubscriptionService.createAdminSubscription({
        companyId: company.id,
        billingPlanId: plan.id,
        billingPlanTierId: tier.id,
        effectiveFrom,
        initialTerms: {
          agreedAmount: "100",
          currency: "USD",
          billingPeriod: "MONTHLY",
          effectiveFrom,
        },
      }),
      billingSubscriptionService.createAdminSubscription({
        companyId: company.id,
        billingPlanId: plan.id,
        billingPlanTierId: tier.id,
        effectiveFrom,
        initialTerms: {
          agreedAmount: "101",
          currency: "USD",
          billingPeriod: "MONTHLY",
          effectiveFrom,
        },
      }),
    ]);

    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        assert.equal(isSqlDeadlockError(outcome.reason), false);
      }
    }

    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const activeRows = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, company.id)
      .query(`
        SELECT id
        FROM dbo.billing_subscriptions
        WHERE company_id = @companyId AND subscription_status = N'ACTIVE'
      `);
    assert.equal(activeRows.recordset.length, 1);
    createdSubscriptionIds.push(String(activeRows.recordset[0].id));
  });

  it("preserves agreed term amount when catalog price changes", async () => {
    const { subscription, tier } = await createActiveSubscription();
    const agreedBefore = await billingSubscriptionService.getCurrentTerms(subscription.id);
    assert.ok(agreedBefore);
    assert.equal(agreedBefore.agreedAmount, "250.5");

    await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "999.990000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      priceKind: "REGULAR",
      effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
    });

    const termAfter = await billingSubscriptionService.getCurrentTerms(subscription.id);
    assert.ok(termAfter);
    assert.equal(termAfter.agreedAmount, "250.5");

    const poolRow = await getPool()
      .request()
      .input("termId", sql.UniqueIdentifier, termAfter.id)
      .query(`SELECT agreed_amount FROM dbo.billing_subscription_terms WHERE id = @termId`);
    assert.equal(normalizeDecimalString(String(poolRow.recordset[0].agreed_amount)), "250.5");
  });

  it("records term history and rejects overlapping intervals", async () => {
    const { subscription } = await createActiveSubscription();
    const versionFrom = new Date("2026-07-01T00:00:00.000Z");

    await billingSubscriptionService.registerContractualTerms({
      subscriptionId: subscription.id,
      agreedAmount: "275.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 51,
      seatMax: 100,
      effectiveFrom: versionFrom,
    });

    const history = await billingSubscriptionService.listTermsHistory(subscription.id);
    assert.equal(history.length, 2);
    assert.equal(history[0]?.agreedAmount, "275");
    assert.ok(history[1]?.effectiveTo);

    await assert.rejects(
      () =>
        billingSubscriptionService.registerContractualTerms({
          subscriptionId: subscription.id,
          agreedAmount: "300",
          currency: "USD",
          billingPeriod: "MONTHLY",
          seatMin: 51,
          seatMax: 100,
          effectiveFrom: new Date("2026-06-15T00:00:00.000Z"),
          effectiveTo: new Date("2026-08-01T00:00:00.000Z"),
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_TERM_OVERLAP");
        return true;
      },
    );
  });

  it("rolls back subscription insert when initial term validation fails", async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();

    await assert.rejects(
      () =>
        billingSubscriptionService.createAdminSubscription({
          companyId: company.id,
          billingPlanId: plan.id,
          billingPlanTierId: tier.id,
          effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
          initialTerms: {
            agreedAmount: "100",
            currency: "USD",
            billingPeriod: "MONTHLY",
            effectiveFrom: new Date("2026-03-01T00:00:00.000Z"),
            effectiveTo: new Date("2026-02-01T00:00:00.000Z"),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_TERM_OUT_OF_PERIOD");
        return true;
      },
    );

    const count = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, company.id)
      .query(`SELECT COUNT(*) AS c FROM dbo.billing_subscriptions WHERE company_id = @companyId`);
    assert.equal(Number(count.recordset[0].c), 0);
  });

  it("finalizes subscription while preserving SQL history", async () => {
    const { subscription } = await createActiveSubscription();
    const endedAt = new Date("2026-12-31T23:59:59.000Z");

    const finalized = await billingSubscriptionService.finalizeSubscription({
      subscriptionId: subscription.id,
      finalStatus: "ENDED",
      endedAt,
    });
    assert.equal(finalized.subscriptionStatus, "ENDED");
    assert.ok(finalized.endedAt);

    const history = await billingSubscriptionService.listSubscriptionHistory(subscription.companyId);
    assert.equal(history.length, 1);
    assert.equal(history[0]?.subscriptionStatus, "ENDED");

    const termCount = await getPool()
      .request()
      .input("subscriptionId", sql.UniqueIdentifier, subscription.id)
      .query(`
        SELECT COUNT(*) AS c
        FROM dbo.billing_subscription_terms
        WHERE billing_subscription_id = @subscriptionId
      `);
    assert.equal(Number(termCount.recordset[0].c), 1);
  });

  it("rejects overlapping ACTIVE and SCHEDULED but allows non-overlapping succession", async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();

    const active = await billingSubscriptionService.createAdminSubscription({
      companyId: company.id,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      subscriptionStatus: "ACTIVE",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-12-31T00:00:00.000Z"),
      initialTerms: {
        agreedAmount: "100",
        currency: "USD",
        billingPeriod: "MONTHLY",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-12-31T00:00:00.000Z"),
      },
    });
    createdSubscriptionIds.push(active.id);

    await assert.rejects(
      () =>
        billingSubscriptionService.createAdminSubscription({
          companyId: company.id,
          billingPlanId: plan.id,
          billingPlanTierId: tier.id,
          subscriptionStatus: "SCHEDULED",
          effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
          initialTerms: {
            agreedAmount: "120",
            currency: "USD",
            billingPeriod: "MONTHLY",
            effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_PERIOD_OVERLAP");
        return true;
      },
    );

    const scheduled = await billingSubscriptionService.createAdminSubscription({
      companyId: company.id,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      subscriptionStatus: "SCHEDULED",
      effectiveFrom: new Date("2026-12-31T00:00:00.000Z"),
      initialTerms: {
        agreedAmount: "130",
        currency: "USD",
        billingPeriod: "MONTHLY",
        effectiveFrom: new Date("2026-12-31T00:00:00.000Z"),
      },
    });
    createdSubscriptionIds.push(scheduled.id);
    assert.equal(scheduled.subscriptionStatus, "SCHEDULED");
  });

  it("rejects contractual terms outside the subscription window", async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();

    await assert.rejects(
      () =>
        billingSubscriptionService.createAdminSubscription({
          companyId: company.id,
          billingPlanId: plan.id,
          billingPlanTierId: tier.id,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          effectiveTo: new Date("2026-12-31T00:00:00.000Z"),
          initialTerms: {
            agreedAmount: "100",
            currency: "USD",
            billingPeriod: "MONTHLY",
            effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_TERM_OUT_OF_PERIOD");
        return true;
      },
    );
  });

  it("rejects incompatible catalog price references and standard seat overrides", async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();
    const price = await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "150",
      currency: "USD",
      billingPeriod: "MONTHLY",
      priceKind: "REGULAR",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    });

    await assert.rejects(
      () =>
        billingSubscriptionService.createAdminSubscription({
          companyId: company.id,
          billingPlanId: plan.id,
          billingPlanTierId: tier.id,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          initialTerms: {
            agreedAmount: "99",
            currency: "USD",
            billingPeriod: "YEARLY",
            billingPlanPriceId: price.id,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH");
        return true;
      },
    );

    await assert.rejects(
      () =>
        billingSubscriptionService.createAdminSubscription({
          companyId: company.id,
          billingPlanId: plan.id,
          billingPlanTierId: tier.id,
          effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
          initialTerms: {
            agreedAmount: "100",
            currency: "USD",
            billingPeriod: "MONTHLY",
            seatMin: 1,
            seatMax: 40,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_TIER_CAPACITY_MISMATCH");
        return true;
      },
    );
  });

  it("resolves scheduled future and ended subscriptions by temporal semantics", async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();
    const at = new Date("2026-06-01T00:00:00.000Z");

    const active = await billingSubscriptionService.createAdminSubscription({
      companyId: company.id,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      subscriptionStatus: "ACTIVE",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-08-01T00:00:00.000Z"),
      initialTerms: {
        agreedAmount: "100",
        currency: "USD",
        billingPeriod: "MONTHLY",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    createdSubscriptionIds.push(active.id);

    const scheduled = await billingSubscriptionService.createAdminSubscription({
      companyId: company.id,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      subscriptionStatus: "SCHEDULED",
      effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      initialTerms: {
        agreedAmount: "120",
        currency: "USD",
        billingPeriod: "MONTHLY",
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
    createdSubscriptionIds.push(scheduled.id);

    assert.ok(await billingSubscriptionService.getCurrentSubscription(company.id, at));
    assert.ok(await billingSubscriptionService.getScheduledFutureSubscription(company.id, at));

    await billingSubscriptionService.finalizeSubscription({
      subscriptionId: active.id,
      finalStatus: "ENDED",
      endedAt: new Date("2026-08-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-08-01T00:00:00.000Z"),
    });

    const ended = await billingSubscriptionService.listEndedSubscriptions(
      company.id,
      new Date("2026-10-01T00:00:00.000Z"),
    );
    assert.equal(ended.length, 1);
    assert.equal(ended[0]?.subscriptionStatus, "ENDED");

    const inScheduledWindow = new Date("2026-09-15T00:00:00.000Z");
    const currentScheduled = await billingSubscriptionService.getCurrentSubscription(
      company.id,
      inScheduledWindow,
    );
    assert.ok(currentScheduled);
    assert.equal(currentScheduled?.subscriptionStatus, "SCHEDULED");
    assert.equal(
      await billingSubscriptionService.getScheduledFutureSubscription(company.id, inScheduledWindow),
      null,
    );
  });

  it("caps open-ended terms to bounded subscription effective_to on create", async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();
    const subEnd = new Date("2026-12-31T00:00:00.000Z");

    const created = await billingSubscriptionService.createAdminSubscription({
      companyId: company.id,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: subEnd,
      initialTerms: {
        agreedAmount: "100",
        currency: "USD",
        billingPeriod: "MONTHLY",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    createdSubscriptionIds.push(created.id);
    assert.equal(created.terms[0]?.effectiveTo, subEnd.toISOString());

    const pool = getPool();
    const row = await pool
      .request()
      .input("termId", sql.UniqueIdentifier, created.terms[0]?.id)
      .query(`
        SELECT effective_to FROM dbo.billing_subscription_terms WHERE id = @termId
      `);
    assert.ok(row.recordset[0]?.effective_to);
  });

  it("versions bounded yearly terms from USD 199 to USD 239 in July without overlapping intervals", async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();
    const yearStart = new Date("2026-01-01T00:00:00.000Z");
    const yearEnd = new Date("2026-12-31T23:59:59.000Z");

    const created = await billingSubscriptionService.createAdminSubscription({
      companyId: company.id,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      effectiveFrom: yearStart,
      effectiveTo: yearEnd,
      initialTerms: {
        agreedAmount: "199.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        effectiveFrom: yearStart,
        effectiveTo: yearEnd,
        seatMin: 51,
        seatMax: 100,
      },
    });
    createdSubscriptionIds.push(created.id);

    const july = new Date("2026-07-01T00:00:00.000Z");
    await billingSubscriptionService.registerContractualTerms({
      subscriptionId: created.id,
      agreedAmount: "239.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 51,
      seatMax: 100,
      effectiveFrom: july,
    });

    const rows = await getPool()
      .request()
      .input("subscriptionId", sql.UniqueIdentifier, created.id)
      .query(`
        SELECT agreed_amount, effective_from, effective_to
        FROM dbo.billing_subscription_terms
        WHERE billing_subscription_id = @subscriptionId
        ORDER BY effective_from ASC
      `);
    assert.equal(rows.recordset.length, 2);
    assert.equal(normalizeDecimalString(String(rows.recordset[0].agreed_amount)), "199");
    assert.equal(normalizeDecimalString(String(rows.recordset[1].agreed_amount)), "239");
    assert.ok(rows.recordset[0].effective_to);
    assert.equal(new Date(rows.recordset[0].effective_to as Date).toISOString(), july.toISOString());
    assert.equal(new Date(rows.recordset[1].effective_from as Date).toISOString(), july.toISOString());
    assert.ok(rows.recordset[1].effective_to);

    const juneTerms = await billingSubscriptionService.getCurrentTerms(
      created.id,
      new Date("2026-06-15T00:00:00.000Z"),
    );
    const augustTerms = await billingSubscriptionService.getCurrentTerms(
      created.id,
      new Date("2026-08-15T00:00:00.000Z"),
    );
    assert.equal(juneTerms?.agreedAmount, "199");
    assert.equal(augustTerms?.agreedAmount, "239");
  });

  it("returns SCHEDULED subscription at exact effective_from instant", async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();
    const scheduledStart = new Date("2026-09-01T00:00:00.000Z");

    const scheduled = await billingSubscriptionService.createAdminSubscription({
      companyId: company.id,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      subscriptionStatus: "SCHEDULED",
      effectiveFrom: scheduledStart,
      initialTerms: {
        agreedAmount: "120",
        currency: "USD",
        billingPeriod: "MONTHLY",
        effectiveFrom: scheduledStart,
        seatMin: 51,
        seatMax: 100,
      },
    });
    createdSubscriptionIds.push(scheduled.id);

    const atStart = await billingSubscriptionService.getCurrentSubscription(company.id, scheduledStart);
    assert.ok(atStart);
    assert.equal(atStart.id, scheduled.id);
    assert.equal(atStart.subscriptionStatus, "SCHEDULED");
    assert.equal(
      await billingSubscriptionService.getScheduledFutureSubscription(company.id, scheduledStart),
      null,
    );
  });

  it("cancels future terms on finalize without artificial intervals", async () => {
    const { subscription } = await createActiveSubscription();

    await billingSubscriptionService.registerContractualTerms({
      subscriptionId: subscription.id,
      agreedAmount: "300",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 51,
      seatMax: 100,
      effectiveFrom: new Date("2026-11-01T00:00:00.000Z"),
    });

    const endedAt = new Date("2026-10-01T00:00:00.000Z");
    const subscriptionEffectiveTo = new Date("2026-10-01T00:00:00.000Z");
    const finalized = await billingSubscriptionService.finalizeSubscription({
      subscriptionId: subscription.id,
      finalStatus: "ENDED",
      endedAt,
      effectiveTo: subscriptionEffectiveTo,
    });
    assert.equal(finalized.subscriptionStatus, "ENDED");

    const pool = getPool();
    const futureTerm = await pool
      .request()
      .input("subscriptionId", sql.UniqueIdentifier, subscription.id)
      .query(`
        SELECT cancelled_at, effective_to, effective_from
        FROM dbo.billing_subscription_terms
        WHERE billing_subscription_id = @subscriptionId
          AND effective_from >= '2026-11-01T00:00:00.000Z'
      `);
    assert.equal(futureTerm.recordset.length, 1);
    assert.ok(futureTerm.recordset[0].cancelled_at);
    assert.equal(futureTerm.recordset[0].effective_to, null);

    const openTerms = await pool
      .request()
      .input("subscriptionId", sql.UniqueIdentifier, subscription.id)
      .query(`
        SELECT COUNT(*) AS c
        FROM dbo.billing_subscription_terms
        WHERE billing_subscription_id = @subscriptionId
          AND cancelled_at IS NULL
          AND effective_to IS NULL
      `);
    assert.equal(Number(openTerms.recordset[0].c), 0);
  });

  it("rejects migration 162 rollback when cancelled_at data exists without partial DDL", async () => {
    const { subscription } = await createActiveSubscription();

    await billingSubscriptionService.registerContractualTerms({
      subscriptionId: subscription.id,
      agreedAmount: "300",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 51,
      seatMax: 100,
      effectiveFrom: new Date("2026-11-01T00:00:00.000Z"),
    });

    await billingSubscriptionService.finalizeSubscription({
      subscriptionId: subscription.id,
      finalStatus: "ENDED",
      endedAt: new Date("2026-10-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-10-01T00:00:00.000Z"),
    });

    const triggerBefore = await getPool().request().query(`
      SELECT 1 AS found
      FROM sys.sql_modules m
      INNER JOIN sys.triggers t ON m.object_id = t.object_id
      WHERE t.name = N'TR_billing_subscription_terms_within_subscription'
        AND m.definition LIKE N'%cancelled_at IS NULL%'
    `);
    assert.equal(Boolean(triggerBefore.recordset[0]), true);

    const rollback162 = readFileSync(
      join(migrationsDir, "rollback", "162_billing_subscription_term_cancellation_rollback.sql"),
      "utf8",
    );

    await assert.rejects(
      () => runSqlScriptBatches(rollback162),
      (error: unknown) => {
        assert.match(String(error), /cancelled_at data|50162/i);
        return true;
      },
    );

    const columnAfter = await getPool().request().query(`
      SELECT 1 AS found
      WHERE COL_LENGTH(N'dbo.billing_subscription_terms', N'cancelled_at') IS NOT NULL
    `);
    assert.equal(Boolean(columnAfter.recordset[0]), true);

    const triggerAfter = await getPool().request().query(`
      SELECT 1 AS found
      FROM sys.sql_modules m
      INNER JOIN sys.triggers t ON m.object_id = t.object_id
      WHERE t.name = N'TR_billing_subscription_terms_within_subscription'
        AND m.definition LIKE N'%cancelled_at IS NULL%'
    `);
    assert.equal(Boolean(triggerAfter.recordset[0]), true);
  });

  it("rolls back subscription row when term insert fails after write in transaction", async () => {
    const company = await seedCompany();
    const { plan, tier } = await seedPlanWithTier();
    const subscriptionStart = new Date("2026-05-01T00:00:00.000Z");
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const inserted = await billingSubscriptionRepository.insertInTransaction(transaction, {
        companyId: company.id,
        billingPlanId: plan.id,
        billingPlanTierId: tier.id,
        subscriptionStatus: "ACTIVE",
        effectiveFrom: subscriptionStart,
      });

      await billingSubscriptionTermRepository.insertVersionInTransaction(transaction, {
        billingSubscriptionId: inserted.id,
        agreedAmount: "10",
        currency: "USD",
        billingPeriod: "MONTHLY",
        seatMin: 51,
        seatMax: 100,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
      });

      await transaction.commit();
      assert.fail("expected term containment failure");
    } catch {
      try {
        await transaction.rollback();
      } catch {
        // Transaction already aborted by SQL Server after trigger failure.
      }
    }

    const subs = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, company.id)
      .query(`SELECT COUNT(*) AS c FROM dbo.billing_subscriptions WHERE company_id = @companyId`);
    assert.equal(Number(subs.recordset[0].c), 0);
  });

  it("does not change company operational status when company has no subscription", async () => {
    const company = await seedCompany();
    const before = await companyRepository.findById(company.id);
    assert.ok(before);

    const current = await billingSubscriptionService.getCurrentSubscription(company.id);
    assert.equal(current, null);

    const after = await companyRepository.findById(company.id);
    assert.ok(after);
    assert.equal(after.status, before.status);
    assert.equal(after.updatedAt, before.updatedAt);
  });
});
