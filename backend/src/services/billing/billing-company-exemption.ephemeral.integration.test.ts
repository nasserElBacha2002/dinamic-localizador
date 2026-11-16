/**
 * DIN-406 Fase 1C — ephemeral SQL Server only (create → prove → destroy).
 * Permanent exemption rows must never touch dinamic_attendance.
 * Enable: RUN_DB_INTEGRATION_TESTS=true, INTEGRATION_SQL_DDL_ALLOWED=true,
 *         INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED=true
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS } from "../../constants/billing-company-exemption";
import { getPool } from "../../database/connection";
import {
  assertBillingCompanyExemptionsImmutabilityTriggerEnabled,
  assertBillingCompanyExemptionsSchemaIntegrity,
  repairBillingCompanyExemptionsImmutabilityTrigger,
} from "../../utils/billing/billing-company-exemption-schema";
import { billingCompanyExemptionRepository } from "../../repositories/billing/billing-company-exemption.repository";
import { isDatabaseIntegrationEnabled } from "../../test-helpers/integration-test";
import {
  activateEphemeralBillingExemptionDatabase,
  createEphemeralBillingExemptionDatabase,
  destroyEphemeralBillingExemptionDatabase,
  type EphemeralBillingExemptionHandle,
} from "../../test-helpers/ephemeral-billing-exemption-database";
import { assertSyntheticStrategicIdentitiesReady } from "../../test-helpers/disposable-strategic-company-identities";
import {
  BillingCompanyExemptionSeedError,
  seedProtectedStrategicCompanyExemptions,
} from "./billing-company-exemption.seed";
import { billingCatalogService } from "./billing-catalog.service";
import { billingPolicyService } from "./billing-policy.service";
import { billingSubscriptionService } from "./billing-subscription.service";

const describeEphemeralBilling = isDatabaseIntegrationEnabled() ? describe : describe.skip;

const countPermanentExemptionsForProtected = async (): Promise<number> => {
  const pool = getPool();
  const request = pool.request();
  PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS.forEach((entry, index) => {
    request.input(`companyId${index}`, sql.UniqueIdentifier, entry.companyId);
  });
  const inClause = PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS.map((_, index) => `@companyId${index}`).join(
    ", ",
  );
  const result = await request.query(`
    SELECT COUNT(*) AS c
    FROM dbo.billing_company_exemptions
    WHERE is_permanent = 1
      AND expires_at IS NULL
      AND company_id IN (${inClause})
  `);
  return Number(result.recordset[0].c);
};

const countPermanentForCompany = async (companyId: string): Promise<number> => {
  const result = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`
      SELECT COUNT(*) AS c
      FROM dbo.billing_company_exemptions
      WHERE company_id = @companyId
        AND is_permanent = 1
        AND expires_at IS NULL
    `);
  return Number(result.recordset[0].c);
};

describeEphemeralBilling("billing company exemption ephemeral SQL proofs", () => {
  let ephemeral: EphemeralBillingExemptionHandle;

  before(async (testContext) => {
    if (process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED !== "true") {
      testContext.skip("INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED is not true");
    }
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
    await assertSyntheticStrategicIdentitiesReady(getPool());
    assert.equal(await countPermanentExemptionsForProtected(), 0);
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
    assert.equal(ephemeral.evidence.destroyed, true);
  });

  it("defines migration 163 schema on the ephemeral database", async () => {
    await assertBillingCompanyExemptionsSchemaIntegrity(getPool());
  });

  it("rejects seed when any protected identity is mismatched without persisting rows", async () => {
    const target = PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS[2];
    const pool = getPool();
    assert.equal(await countPermanentExemptionsForProtected(), 0);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, target.companyId)
      .query(`DELETE FROM dbo.companies WHERE id = @companyId`);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, target.companyId)
      .input("wrongName", sql.NVarChar(200), "Nombre estratégico incorrecto")
      .query(`
        INSERT INTO dbo.companies (id, name, default_timezone, status)
        VALUES (@companyId, @wrongName, N'America/Argentina/Buenos_Aires', N'ACTIVE');
      `);

    await assert.rejects(
      () => seedProtectedStrategicCompanyExemptions(),
      (error: unknown) => {
        assert.ok(error instanceof BillingCompanyExemptionSeedError);
        return true;
      },
    );
    assert.equal(await countPermanentExemptionsForProtected(), 0);

    await pool.request().input("companyId", sql.UniqueIdentifier, target.companyId).query(`
      DELETE FROM dbo.companies WHERE id = @companyId;
    `);
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, target.companyId)
      .input("name", sql.NVarChar(200), target.expectedName)
      .query(`
        INSERT INTO dbo.companies (id, name, default_timezone, status)
        VALUES (@companyId, @name, N'America/Argentina/Buenos_Aires', N'ACTIVE');
      `);
    await assertSyntheticStrategicIdentitiesReady(pool);
  });

  it("rolls back a failed exemption transaction without adding permanent rows", async () => {
    const pool = getPool();
    const companyA = "22222222-2222-4222-8222-222222222201";
    const companyB = "22222222-2222-4222-8222-222222222202";
    await pool.request().query(`
      INSERT INTO dbo.companies (id, name, default_timezone, status)
      VALUES
        ('${companyA}', N'Rollback Co A', N'America/Argentina/Buenos_Aires', N'ACTIVE'),
        ('${companyB}', N'Rollback Co B', N'America/Argentina/Buenos_Aires', N'ACTIVE');
    `);
    assert.equal(await countPermanentForCompany(companyA), 0);
    assert.equal(await countPermanentForCompany(companyB), 0);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    await new sql.Request(transaction).query(`SET XACT_ABORT ON;`);

    await billingCompanyExemptionRepository.insertPermanentIfAbsentInTransaction(transaction, {
      companyId: companyA,
      exemptionReason: "Rollback probe A",
      createdSource: "DISPOSABLE_SEED",
    });

    const bogusUserId = "00000000-0000-0000-0000-000000000099";
    await assert.rejects(
      () =>
        billingCompanyExemptionRepository.insertPermanentIfAbsentInTransaction(transaction, {
          companyId: companyB,
          exemptionReason: "Rollback probe B",
          createdSource: "DISPOSABLE_SEED",
          createdByUserId: bogusUserId,
        }),
      /FK_billing_company_exemptions_created_by|foreign key/i,
    );

    try {
      await transaction.rollback();
    } catch {
      // Transaction may already be aborted.
    }

    assert.equal(await countPermanentForCompany(companyA), 0);
    assert.equal(await countPermanentForCompany(companyB), 0);
    assert.equal(await countPermanentExemptionsForProtected(), 0);
  });

  it("seeds three strategic exemptions from zero and idempotently skips existing rows", async () => {
    assert.equal(await countPermanentExemptionsForProtected(), 0);

    const first = await seedProtectedStrategicCompanyExemptions();
    const second = await seedProtectedStrategicCompanyExemptions();

    assert.equal(first.length, 3);
    assert.equal(second.length, 3);
    assert.equal(first.filter((row) => row.inserted).length, 3);
    assert.ok(second.every((row) => row.skippedExisting));
    assert.equal(await countPermanentExemptionsForProtected(), 3);
    for (const entry of PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS) {
      assert.equal(await countPermanentForCompany(entry.companyId), 1);
    }
  });

  it("serializes concurrent full seed calls without duplicate rows", async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 3 }, () => seedProtectedStrategicCompanyExemptions()),
    );

    assert.equal(
      outcomes.filter((outcome) => outcome.status === "fulfilled").length,
      3,
    );
    assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 0);
    assert.equal(await countPermanentExemptionsForProtected(), 3);
  });

  it("blocks id mutation on permanent exemptions via immutability trigger", async () => {
    const pool = getPool();
    const strategic = PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS[0];
    const existing = await billingCompanyExemptionRepository.findOpenPermanentByCompanyId(
      strategic.companyId,
    );
    assert.ok(existing);
    const replacementId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    await assert.rejects(
      () =>
        pool
          .request()
          .input("id", sql.UniqueIdentifier, existing.id)
          .input("replacementId", sql.UniqueIdentifier, replacementId)
          .query(`
            UPDATE dbo.billing_company_exemptions
            SET id = @replacementId
            WHERE id = @id
          `),
      /50163|cannot be modified/i,
    );
  });

  it("blocks delete and update on permanent exemptions via immutability trigger", async () => {
    const pool = getPool();
    const strategic = PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS[0];
    const existing = await billingCompanyExemptionRepository.findOpenPermanentByCompanyId(
      strategic.companyId,
    );
    assert.ok(existing);

    await assert.rejects(
      () =>
        pool
          .request()
          .input("id", sql.UniqueIdentifier, existing.id)
          .query(`DELETE FROM dbo.billing_company_exemptions WHERE id = @id`),
      /50163|cannot be modified/i,
    );
    await assert.rejects(
      () =>
        pool
          .request()
          .input("id", sql.UniqueIdentifier, existing.id)
          .query(`
            UPDATE dbo.billing_company_exemptions
            SET exemption_reason = N'Alterado'
            WHERE id = @id
          `),
      /50163|cannot be modified/i,
    );
    await assert.rejects(
      () =>
        pool
          .request()
          .input("id", sql.UniqueIdentifier, existing.id)
          .query(`
            UPDATE dbo.billing_company_exemptions
            SET updated_at = SYSUTCDATETIME()
            WHERE id = @id
          `),
      /50163|cannot be modified/i,
    );
  });

  it("rolls back multi-row exemption update when any permanent row is touched", async () => {
    const pool = getPool();
    const ids = await pool.request().query(`
      SELECT id FROM dbo.billing_company_exemptions
      WHERE is_permanent = 1 AND expires_at IS NULL
    `);
    const rows = ids.recordset as { id: string }[];
    assert.ok(rows.length >= 2);
    const countBefore = await countPermanentExemptionsForProtected();

    await assert.rejects(
      () =>
        pool.request().query(`
          BEGIN TRANSACTION;
          UPDATE dbo.billing_company_exemptions
          SET updated_at = SYSUTCDATETIME()
          WHERE is_permanent = 1 AND expires_at IS NULL;
          COMMIT;
        `),
      /50163|cannot be modified/i,
    );

    assert.equal(await countPermanentExemptionsForProtected(), countBefore);
  });

  it("rejects schema integrity when immutability trigger is disabled without auto-repair", async () => {
    const pool = getPool();
    await pool.request().query(`
      DISABLE TRIGGER TR_billing_company_exemptions_immutable ON dbo.billing_company_exemptions;
    `);
    await assert.rejects(
      () => assertBillingCompanyExemptionsSchemaIntegrity(pool),
      /TR_billing_company_exemptions_immutable is disabled/i,
    );
    await repairBillingCompanyExemptionsImmutabilityTrigger(pool);
    await assertBillingCompanyExemptionsImmutabilityTriggerEnabled(pool);
  });

  it("keeps strategic exempt policy when a protected company has a commercial subscription", async () => {
    const strategic = PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS[0];
    const plan = await billingCatalogService.createPlan({
      planCode: `STRAT-EPH-${Date.now().toString(36)}`,
      displayName: "Plan estratégico efímero",
      planKind: "STANDARD",
    });
    const tier = await billingCatalogService.createTier(plan.id, {
      tierCode: "E50",
      displayName: "Hasta 50",
      seatMin: 1,
      seatMax: 50,
    });
    const subscription = await billingSubscriptionService.createAdminSubscription({
      companyId: strategic.companyId,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      subscriptionStatus: "ACTIVE",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      initialTerms: {
        agreedAmount: "0",
        currency: "USD",
        billingPeriod: "MONTHLY",
        seatMin: 1,
        seatMax: 50,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    const policy = await billingPolicyService.getCompanyBillingPolicy(strategic.companyId);
    assert.equal(policy.isExempt, true);
    assert.equal(policy.requiresPayment, false);
    assert.equal(policy.enforceSeatLimit, false);
    assert.equal(policy.allowCommercialSuspension, false);
    assert.ok(subscription.id);
  });
});