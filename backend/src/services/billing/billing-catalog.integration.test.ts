/**
 * DIN-406 Fase 1A — billing catalog service integration.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import { billingPlanPriceRepository } from "../../repositories/billing/billing-plan-price.repository";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { ensureBillingCatalogMigration } from "../../test-helpers/ensure-billing-catalog-migration";
import { isSqlDeadlockError } from "../../utils/sql-server-errors";
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

  const seedPlan = async (planCode?: string) => {
    const plan = await billingCatalogService.createPlan({
      planCode: planCode ?? `TPL-${uniqueSuffix()}`,
      displayName: "Plan de prueba",
      planKind: "STANDARD",
    });
    createdPlanIds.push(plan.id);
    return plan;
  };

  const seedPlanWithTier = async () => {
    const plan = await seedPlan();
    const tier = await billingCatalogService.createTier(plan.id, {
      tierCode: "T50",
      displayName: "Hasta 50",
      seatMin: 1,
      seatMax: 50,
    });
    return { plan, tier };
  };

  it("allows inactive tiers with overlapping ranges until activation", async () => {
    const plan = await seedPlan();

    const dormant = await billingCatalogService.createTier(plan.id, {
      tierCode: "DORMANT",
      displayName: "Inactivo solapado",
      seatMin: 10,
      seatMax: 80,
      isActive: false,
    });
    assert.equal(dormant.isActive, false);

    const activeTier = await billingCatalogService.createTier(plan.id, {
      tierCode: "ACTIVE",
      displayName: "Activo",
      seatMin: 1,
      seatMax: 50,
    });
    assert.equal(activeTier.isActive, true);

    await assert.rejects(
      () =>
        billingCatalogService.updateTier(dormant.id, {
          isActive: true,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_TIER_SEAT_RANGE_OVERLAP");
        return true;
      },
    );
  });

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

  it("serializes concurrent tier creates so overlapping active ranges cannot persist", async () => {
    const plan = await seedPlan();

    const outcomes = await Promise.allSettled([
      billingCatalogService.createTier(plan.id, {
        tierCode: "TA",
        displayName: "Concurrente A",
        seatMin: 1,
        seatMax: 60,
      }),
      billingCatalogService.createTier(plan.id, {
        tierCode: "TB",
        displayName: "Concurrente B",
        seatMin: 40,
        seatMax: 100,
      }),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const pool = getPool();
    const activeRows = await pool
      .request()
      .input("planId", sql.UniqueIdentifier, plan.id)
      .query(`
        SELECT seat_min, seat_max
        FROM dbo.billing_plan_tiers
        WHERE billing_plan_id = @planId AND is_active = 1
        ORDER BY seat_min ASC
      `);

    for (let index = 0; index < activeRows.recordset.length; index += 1) {
      for (let inner = index + 1; inner < activeRows.recordset.length; inner += 1) {
        const left = activeRows.recordset[index] as { seat_min: number; seat_max: number | null };
        const right = activeRows.recordset[inner] as { seat_min: number; seat_max: number | null };
        const leftMax = left.seat_max ?? Number.MAX_SAFE_INTEGER;
        const rightMax = right.seat_max ?? Number.MAX_SAFE_INTEGER;
        const overlaps = left.seat_min <= rightMax && right.seat_min <= leftMax;
        assert.equal(overlaps, false);
      }
    }
  });

  const assertNoDeadlocks = (outcomes: PromiseSettledResult<unknown>[]) => {
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        assert.equal(
          isSqlDeadlockError(outcome.reason),
          false,
          `unexpected deadlock: ${String(outcome.reason)}`,
        );
      }
    }
  };

  const assertNoOverlappingActiveTiers = async (planId: string) => {
    const pool = getPool();
    const activeRows = await pool
      .request()
      .input("planId", sql.UniqueIdentifier, planId)
      .query(`
        SELECT seat_min, seat_max
        FROM dbo.billing_plan_tiers
        WHERE billing_plan_id = @planId AND is_active = 1
        ORDER BY seat_min ASC
      `);

    for (let index = 0; index < activeRows.recordset.length; index += 1) {
      for (let inner = index + 1; inner < activeRows.recordset.length; inner += 1) {
        const left = activeRows.recordset[index] as { seat_min: number; seat_max: number | null };
        const right = activeRows.recordset[inner] as { seat_min: number; seat_max: number | null };
        const leftMax = left.seat_max ?? Number.MAX_SAFE_INTEGER;
        const rightMax = right.seat_max ?? Number.MAX_SAFE_INTEGER;
        const overlaps = left.seat_min <= rightMax && right.seat_min <= leftMax;
        assert.equal(overlaps, false);
      }
    }
  };

  it("serializes concurrent createTier and updateTier without deadlocks or overlapping ranges", async () => {
    const plan = await seedPlan();
    const baseTier = await billingCatalogService.createTier(plan.id, {
      tierCode: "BASE",
      displayName: "Base",
      seatMin: 1,
      seatMax: 30,
    });

    const outcomes = await Promise.allSettled([
      billingCatalogService.createTier(plan.id, {
        tierCode: "CONC_NEW",
        displayName: "Nuevo concurrente",
        seatMin: 25,
        seatMax: 55,
      }),
      billingCatalogService.updateTier(baseTier.id, { seatMax: 45 }),
    ]);

    assertNoDeadlocks(outcomes);
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const failure = rejected[0] as PromiseRejectedResult;
    assert.ok(failure.reason instanceof AppError);
    assert.equal(failure.reason.code, "BILLING_TIER_SEAT_RANGE_OVERLAP");

    await assertNoOverlappingActiveTiers(plan.id);

    const pool = getPool();
    const tiers = await pool
      .request()
      .input("planId", sql.UniqueIdentifier, plan.id)
      .input("baseTierId", sql.UniqueIdentifier, baseTier.id)
      .query(`
        SELECT id, tier_code, seat_min, seat_max
        FROM dbo.billing_plan_tiers
        WHERE billing_plan_id = @planId AND is_active = 1
        ORDER BY seat_min ASC
      `);

    if (outcomes[0]?.status === "fulfilled") {
      assert.equal(tiers.recordset.length, 2);
      const created = tiers.recordset.find(
        (row) => String((row as { tier_code: string }).tier_code) === "CONC_NEW",
      );
      assert.ok(created);
      const baseRow = tiers.recordset.find(
        (row) => String((row as { id: string }).id) === baseTier.id,
      ) as { seat_max: number } | undefined;
      assert.ok(baseRow);
      assert.equal(baseRow.seat_max, 30);
    } else {
      assert.equal(tiers.recordset.length, 1);
      const baseRow = tiers.recordset[0] as { id: string; seat_max: number };
      assert.equal(String(baseRow.id), baseTier.id);
      assert.equal(baseRow.seat_max, 45);
    }
  });

  it("serializes concurrent tier updates so active ranges never overlap after contention", async () => {
    const plan = await seedPlan();
    const tierA = await billingCatalogService.createTier(plan.id, {
      tierCode: "UA",
      displayName: "Update A",
      seatMin: 1,
      seatMax: 30,
    });
    const tierB = await billingCatalogService.createTier(plan.id, {
      tierCode: "UB",
      displayName: "Update B",
      seatMin: 60,
      seatMax: 90,
    });

    const outcomes = await Promise.allSettled([
      billingCatalogService.updateTier(tierA.id, { seatMax: 70 }),
      billingCatalogService.updateTier(tierB.id, { seatMin: 50 }),
    ]);
    assertNoDeadlocks(outcomes);
    await assertNoOverlappingActiveTiers(plan.id);

    const pool = getPool();
    const updatedA = await pool
      .request()
      .input("tierId", sql.UniqueIdentifier, tierA.id)
      .query(`SELECT seat_min, seat_max FROM dbo.billing_plan_tiers WHERE id = @tierId`);
    const updatedB = await pool
      .request()
      .input("tierId", sql.UniqueIdentifier, tierB.id)
      .query(`SELECT seat_min, seat_max FROM dbo.billing_plan_tiers WHERE id = @tierId`);
    const rowA = updatedA.recordset[0] as { seat_min: number; seat_max: number };
    const rowB = updatedB.recordset[0] as { seat_min: number; seat_max: number };
    const mergedOverlap = rowA.seat_min <= rowB.seat_max && rowB.seat_min <= rowA.seat_max;
    assert.equal(mergedOverlap, false);
  });

  it("keeps regular and promotional USD prices active at the same instant", async () => {
    const { tier } = await seedPlanWithTier();
    const effectiveFrom = new Date("2026-01-01T00:00:00.000Z");
    const at = new Date("2026-06-15T00:00:00.000Z");

    await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "119",
      currency: "USD",
      billingPeriod: "MONTHLY",
      priceKind: "REGULAR",
      effectiveFrom,
    });

    await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "99",
      currency: "USD",
      billingPeriod: "MONTHLY",
      priceKind: "PROMOTIONAL",
      effectiveFrom,
    });

    const regular = await billingPlanPriceRepository.findActiveAt({
      billingPlanTierId: tier.id,
      currency: "USD",
      billingPeriod: "MONTHLY",
      priceKind: "REGULAR",
      at,
    });
    const promotional = await billingPlanPriceRepository.findActiveAt({
      billingPlanTierId: tier.id,
      currency: "USD",
      billingPeriod: "MONTHLY",
      priceKind: "PROMOTIONAL",
      at,
    });

    assert.ok(regular);
    assert.ok(promotional);
    assert.equal(regular.amount, "119");
    assert.equal(promotional.amount, "99");

    const pool = getPool();
    const openKinds = await pool
      .request()
      .input("tierId", sql.UniqueIdentifier, tier.id)
      .query(`
        SELECT price_kind
        FROM dbo.billing_plan_prices
        WHERE billing_plan_tier_id = @tierId
          AND currency = 'USD'
          AND billing_period = 'MONTHLY'
          AND effective_to IS NULL
        ORDER BY price_kind ASC
      `);
    assert.equal(openKinds.recordset.length, 2);
    assert.equal(String(openKinds.recordset[0].price_kind), "PROMOTIONAL");
    assert.equal(String(openKinds.recordset[1].price_kind), "REGULAR");
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
      priceKind: "REGULAR",
      effectiveFrom: firstFrom,
    });

    const v2 = await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "1500.00",
      currency: "ARS",
      billingPeriod: "MONTHLY",
      priceKind: "REGULAR",
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

  it("allows bounded retroactive regular prices that do not overlap the open regular row", async () => {
    const { tier } = await seedPlanWithTier();
    const openFrom = new Date("2026-07-01T00:00:00.000Z");

    await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "1500",
      currency: "EUR",
      billingPeriod: "MONTHLY",
      priceKind: "REGULAR",
      effectiveFrom: openFrom,
    });

    const retro = await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "1200",
      currency: "EUR",
      billingPeriod: "MONTHLY",
      priceKind: "REGULAR",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-07-01T00:00:00.000Z"),
    });

    assert.equal(retro.effectiveTo, "2026-07-01T00:00:00.000Z");

    const history = await billingCatalogService.listTierPriceHistory(tier.id);
    assert.equal(history.length, 2);
    const openRow = history.find((row) => row.effectiveTo === null);
    assert.ok(openRow);
    assert.equal(openRow.amount, "1500");
  });

  it("rejects retroactive regular prices that would overlap the open regular row", async () => {
    const { tier } = await seedPlanWithTier();
    await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "800",
      currency: "EUR",
      billingPeriod: "YEARLY",
      priceKind: "REGULAR",
      effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
    });

    await assert.rejects(
      () =>
        billingCatalogService.publishPriceVersion({
          billingPlanTierId: tier.id,
          amount: "700",
          currency: "EUR",
          billingPeriod: "YEARLY",
          priceKind: "REGULAR",
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          effectiveTo: new Date("2026-12-01T00:00:00.000Z"),
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_PRICE_PERIOD_OVERLAP");
        return true;
      },
    );

    const history = await billingCatalogService.listTierPriceHistory(tier.id);
    assert.equal(history.length, 1);
    assert.equal(history[0]!.amount, "800");
  });

  it("rejects overlapping price vigencies for the same applicability", async () => {
    const { tier } = await seedPlanWithTier();
    const from = new Date("2026-03-01T00:00:00.000Z");

    await billingCatalogService.publishPriceVersion({
      billingPlanTierId: tier.id,
      amount: "900",
      currency: "USD",
      billingPeriod: "YEARLY",
      priceKind: "REGULAR",
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
          priceKind: "REGULAR",
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

  it("rejects invalid effective instants without persisting changes", async () => {
    const { tier } = await seedPlanWithTier();

    await assert.rejects(
      () =>
        billingCatalogService.publishPriceVersion({
          billingPlanTierId: tier.id,
          amount: "100",
          currency: "USD",
          billingPeriod: "MONTHLY",
          effectiveFrom: new Date("invalid"),
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_INVALID_EFFECTIVE_RANGE");
        return true;
      },
    );

    const history = await billingCatalogService.listTierPriceHistory(tier.id);
    assert.equal(history.length, 0);
  });

  it("serializes concurrent open price publishes per price_kind", async () => {
    const { tier } = await seedPlanWithTier();
    const effectiveFrom = new Date("2028-01-01T00:00:00.000Z");

    const outcomes = await Promise.allSettled([
      billingCatalogService.publishPriceVersion({
        billingPlanTierId: tier.id,
        amount: "2000",
        currency: "ARS",
        billingPeriod: "MONTHLY",
        priceKind: "REGULAR",
        effectiveFrom,
      }),
      billingCatalogService.publishPriceVersion({
        billingPlanTierId: tier.id,
        amount: "2100",
        currency: "ARS",
        billingPeriod: "MONTHLY",
        priceKind: "REGULAR",
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
          AND price_kind = 'REGULAR'
          AND effective_to IS NULL
      `);
    assert.equal(Number(openRows.recordset[0].total), 1);
  });
});
