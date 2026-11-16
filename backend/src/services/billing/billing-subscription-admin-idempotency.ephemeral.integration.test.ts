/**
 * DIN-406 Fase 2B corrections — admin idempotency, concurrency, transitions.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import { getPool } from "../../database/connection";
import { AppError } from "../../errors/app-error";
import { auditService } from "../audit.service";
import { isDatabaseIntegrationEnabled } from "../../test-helpers/integration-test";
import {
  activateEphemeralBillingExemptionDatabase,
  createEphemeralBillingExemptionDatabase,
  destroyEphemeralBillingExemptionDatabase,
  type EphemeralBillingExemptionHandle,
} from "../../test-helpers/ephemeral-billing-exemption-database";
import { seedBillingLaunchPlan } from "./billing-launch-plan.seed";
import { billingCatalogService } from "./billing-catalog.service";
import { billingNegotiatedContractService } from "./billing-negotiated-contract.service";
import { billingSubscriptionService } from "./billing-subscription.service";

const ephemeralEnabled =
  isDatabaseIntegrationEnabled() && process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED === "true";
const describeEphemeral = ephemeralEnabled ? describe : describe.skip;

const ACTOR_USER_ID = "00000000-0000-0000-0000-000000000088";

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

describeEphemeral("billing subscription admin idempotency ephemeral", () => {
  let ephemeral: EphemeralBillingExemptionHandle;
  let launchPlanId: string;
  let launchTierId: string;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
    const launch = await seedBillingLaunchPlan({ strictInitialPrice: true });
    launchPlanId = launch.planId;
    launchTierId = launch.tierId;
    await getPool()
      .request()
      .input("userId", sql.UniqueIdentifier, ACTOR_USER_ID)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE id = @userId)
        BEGIN
          INSERT INTO dbo.users (id, name, email, password_hash, role, active)
          VALUES (@userId, N'Idem Actor', N'idem-actor@test.local', N'x', N'ADMIN', 1);
        END
      `);
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
    assert.equal(ephemeral.evidence.destroyed, true);
  });

  it("replays identical adminRequestKey without duplicate rows or audit", async () => {
    const companyId = await seedDisposableCompany(`Idem audit ${Date.now()}`);
    const customPlan = await billingCatalogService.createPlan({
      planCode: `IDEM_AUDIT_${Date.now().toString(36)}`,
      displayName: "Idem audit",
      planKind: "CUSTOM",
    });
    const effectiveFrom = new Date("2027-05-01T00:00:00.000Z");
    const adminRequestKey = `idem-audit-${randomUUID()}`;

    const first = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom,
      agreedAmount: "500.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 120,
      actorUserId: ACTOR_USER_ID,
      adminRequestKey,
    });

    const auditsAfterFirst = await auditService.listByEntity(
      companyId,
      "billing_subscription",
      first.id,
      1,
      20,
    );
    assert.equal(auditsAfterFirst.total, 1);

    const second = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom,
      agreedAmount: "500.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 120,
      actorUserId: ACTOR_USER_ID,
      adminRequestKey,
    });

    assert.equal(first.id, second.id);
    const auditsAfterSecond = await auditService.listByEntity(
      companyId,
      "billing_subscription",
      first.id,
      1,
      20,
    );
    assert.equal(auditsAfterSecond.total, 1);
  });

  it("rejects adminRequestKey reuse with a different payload", async () => {
    const companyId = await seedDisposableCompany(`Idem mismatch ${Date.now()}`);
    const customPlan = await billingCatalogService.createPlan({
      planCode: `IDEM_MISMATCH_${Date.now().toString(36)}`,
      displayName: "Mismatch",
      planKind: "CUSTOM",
    });
    const adminRequestKey = `idem-mismatch-${randomUUID()}`;
    const effectiveFrom = new Date("2027-06-01T00:00:00.000Z");

    await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom,
      agreedAmount: "400.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      actorUserId: ACTOR_USER_ID,
      adminRequestKey,
    });

    await assert.rejects(
      () =>
        billingNegotiatedContractService.createNegotiatedAgreement({
          companyId,
          billingPlanId: customPlan.id,
          effectiveFrom,
          agreedAmount: "401.000000",
          currency: "USD",
          billingPeriod: "MONTHLY",
          seatMin: 1,
          seatMax: 100,
          actorUserId: ACTOR_USER_ID,
          adminRequestKey,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_ADMIN_REQUEST_PAYLOAD_MISMATCH");
        return true;
      },
    );
  });

  it("handles concurrent retries with the same adminRequestKey and payload", async () => {
    const companyId = await seedDisposableCompany(`Concurrent ${Date.now()}`);
    const customPlan = await billingCatalogService.createPlan({
      planCode: `CONC_${Date.now().toString(36)}`,
      displayName: "Concurrent",
      planKind: "CUSTOM",
    });
    const effectiveFrom = new Date("2027-07-01T00:00:00.000Z");
    const adminRequestKey = `conc-${randomUUID()}`;
    const payload = {
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom,
      agreedAmount: "600.000000",
      currency: "USD",
      billingPeriod: "MONTHLY" as const,
      seatMin: 1,
      seatMax: 150,
      actorUserId: ACTOR_USER_ID,
      adminRequestKey,
    };

    const [a, b] = await Promise.all([
      billingNegotiatedContractService.createNegotiatedAgreement(payload),
      billingNegotiatedContractService.createNegotiatedAgreement(payload),
    ]);
    assert.equal(a.id, b.id);
    const count = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`SELECT COUNT(*) AS c FROM dbo.billing_subscriptions WHERE company_id = @companyId`);
    assert.equal(Number(count.recordset[0].c), 1);
  });

  it("transitions STANDARD launch to CUSTOM with historical plan preserved", async () => {
    const companyId = await seedDisposableCompany(`Transition ${Date.now()}`);
    const effectiveFrom = new Date("2027-08-01T00:00:00.000Z");
    const standard = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: launchPlanId,
      billingPlanTierId: launchTierId,
      effectiveFrom,
      agreedAmount: "300.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      actorUserId: ACTOR_USER_ID,
    });

    const customPlan = await billingCatalogService.createPlan({
      planCode: `TRANS_CUSTOM_${Date.now().toString(36)}`,
      displayName: "Transición CUSTOM",
      planKind: "CUSTOM",
    });
    const transitionAt = new Date("2027-09-01T00:00:00.000Z");
    const transition = await billingNegotiatedContractService.transitionStandardToCustomNegotiatedAgreement({
      companyId,
      currentSubscriptionId: standard.id,
      customBillingPlanId: customPlan.id,
      transitionAt,
      agreedAmount: "550.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 180,
      actorUserId: ACTOR_USER_ID,
    });

    assert.equal(transition.previousSubscription.billingPlanId, launchPlanId);
    assert.equal(transition.previousSubscription.subscriptionStatus, "ENDED");
    assert.equal(transition.customSubscription.billingPlanId, customPlan.id);
    assert.notEqual(transition.customSubscription.id, standard.id);
    const julyTerms = await billingSubscriptionService.getCurrentTerms(
      standard.id,
      new Date("2027-08-15T00:00:00.000Z"),
    );
    assert.ok(julyTerms);
  });

  it("rolls back new term when containment validation fails inside service transaction", async () => {
    const companyId = await seedDisposableCompany(`Rollback ${Date.now()}`);
    const plan = await billingCatalogService.createPlan({
      planCode: `RB_${Date.now().toString(36)}`,
      displayName: "Rollback",
      planKind: "STANDARD",
    });
    const tier = await billingCatalogService.createTier(plan.id, {
      tierCode: "T10",
      displayName: "10",
      seatMin: 1,
      seatMax: 10,
    });
    const subscriptionStart = new Date("2027-10-01T00:00:00.000Z");
    const created = await billingSubscriptionService.createAdminSubscription({
      companyId,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      effectiveFrom: subscriptionStart,
      initialTerms: {
        agreedAmount: "100.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        seatMin: 1,
        seatMax: 10,
        effectiveFrom: subscriptionStart,
      },
    });

    await assert.rejects(
      () =>
        billingSubscriptionService.registerContractualTerms({
          subscriptionId: created.id,
          agreedAmount: "110.000000",
          currency: "USD",
          billingPeriod: "MONTHLY",
          seatMin: 1,
          seatMax: 10,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        }),
      () => true,
    );

    const terms = await billingSubscriptionService.listTermsHistory(created.id);
    assert.equal(terms.length, 1);
  });
});