/**
 * DIN-406 Fase 1A — billing catalog service integration.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { ensureBillingCatalogMigration } from "../../test-helpers/ensure-billing-catalog-migration";
import { billingCatalogService } from "./billing-catalog.service";

const uniqueSuffix = () => Date.now().toString(36);

describeDatabaseIntegration("billing catalog service integration", () => {
  const createdPlanIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    await ensureBillingCatalogMigration();
  });

  after(async () => {
    const pool = getPool();
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
      planCode: `TPL-${uniqueSuffix()}`,
      displayName: "Plan de prueba",
      planKind: "STANDARD",
    });
    createdPlanIds.push(plan.id);

    const tier = await billingCatalogService.createTier(plan.id, {
      tierCode: "T50",
      displayName: "Hasta 50",
      seatMin: 1,
      seatMax: 50,
    });

    return { plan, tier };
  };

  it("rejects overlapping seat ranges within the same plan", async () => {
    const { plan } = await seedPlanWithTier();

    await assert.rejects(
      () =>
        billingCatalogService.createTier(plan.id, {
          tierCode: "T100",
          displayName: "Solapado",
          seatMin: 40,
          seatMax: 100,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_TIER_SEAT_RANGE_OVERLAP");
        return true;
      },
    );
  });

  it("preserves historical prices when publishing a new version", async () => {
    const { tier } = await seedPlanWithTier();
    const firstFrom = new Date("2026-01-01T00:00:00.000Z");
    const secondFrom = new Date("2026-07-01T00:00:00.000Z");

    const v1 = await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "1000.00",
      currency: "ARS",
      billingPeriod: "MONTHLY",
      effectiveFrom: firstFrom,
    });

    const v2 = await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "1500.00",
      currency: "ARS",
      billingPeriod: "MONTHLY",
      effectiveFrom: secondFrom,
    });

    const history = await billingCatalogService.listTierPriceHistory(tier.id);
    assert.equal(history.length, 2);

    const historical = history.find((row) => row.id === v1.id);
    assert.ok(historical);
    assert.equal(historical.amount, "1000");
    assert.ok(historical.effectiveTo);
    assert.equal(new Date(historical.effectiveTo!).toISOString(), secondFrom.toISOString());

    assert.equal(v2.amount, "1500");
    assert.equal(v2.effectiveTo, null);
  });

  it("rejects overlapping price vigencies for the same applicability", async () => {
    const { tier } = await seedPlanWithTier();
    const from = new Date("2026-03-01T00:00:00.000Z");

    await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "900",
      currency: "USD",
      billingPeriod: "YEARLY",
      effectiveFrom: from,
      effectiveTo: new Date("2027-01-01T00:00:00.000Z"),
    });

    await assert.rejects(
      () =>
        billingCatalogService.publishPriceVersion({
          billingPlanTierId: tier.id,
          amount: "950",
          currency: "USD",
          billingPeriod: "YEARLY",
          effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
          effectiveTo: new Date("2027-06-01T00:00:00.000Z"),
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_PRICE_PERIOD_OVERLAP");
        return true;
      },
    );
  });

  it("serializes concurrent open price publishes so only one open row remains", async () => {
    const { tier } = await seedPlanWithTier();
    const effectiveFrom = new Date("2028-01-01T00:00:00.000Z");

    const outcomes = await Promise.allSettled([
      billingCatalogService.publishPriceVersion({
        billingPlanTierId: tier.id,
        amount: "2000",
        currency: "ARS",
        billingPeriod: "MONTHLY",
        effectiveFrom,
      }),
      billingCatalogService.publishPriceVersion({
        billingPlanTierId: tier.id,
        amount: "2100",
        currency: "ARS",
        billingPeriod: "MONTHLY",
        effectiveFrom,
      }),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const pool = getPool();
    const openRows = await pool
      .request()
      .input("tierId", sql.UniqueIdentifier, tier.id)
      .query(`
        SELECT COUNT(*) AS total
        FROM dbo.billing_plan_prices
        WHERE billing_plan_tier_id = @tierId
          AND currency = 'ARS'
          AND billing_period = 'MONTHLY'
          AND effective_to IS NULL
      `);
    assert.equal(Number(openRows.recordset[0].total), 1);
  });
});
