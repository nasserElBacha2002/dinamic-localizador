/**
 * DIN-406 Fase 2C — commercial benefits via explicit contractual versions.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import { getPool } from "../../database/connection";
import { AppError } from "../../errors/app-error";
import { isDatabaseIntegrationEnabled } from "../../test-helpers/integration-test";
import {
  activateEphemeralBillingExemptionDatabase,
  createEphemeralBillingExemptionDatabase,
  destroyEphemeralBillingExemptionDatabase,
  type EphemeralBillingExemptionHandle,
} from "../../test-helpers/ephemeral-billing-exemption-database";
import { seedBillingLaunchPlan } from "./billing-launch-plan.seed";
import { billingCatalogService } from "./billing-catalog.service";
import { billingCommercialBenefitService } from "./billing-commercial-benefit.service";
import { billingNegotiatedContractService } from "./billing-negotiated-contract.service";
import { billingPolicyService } from "./billing-policy.service";
import { PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS } from "../../constants/billing-company-exemption";
import { seedProtectedStrategicCompanyExemptions } from "./billing-company-exemption.seed";

const ephemeralEnabled =
  isDatabaseIntegrationEnabled() && process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED === "true";
const describeEphemeral = ephemeralEnabled ? describe : describe.skip;

const ACTOR_USER_ID = "00000000-0000-0000-0000-000000000099";

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

describeEphemeral("billing commercial benefit ephemeral", () => {
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
          VALUES (@userId, N'Benefit Actor', N'benefit-actor@test.local', N'x', N'ADMIN', 1);
        END
      `);
    await seedProtectedStrategicCompanyExemptions();
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
    assert.equal(ephemeral.evidence.destroyed, true);
  });

  it("registers fixed and percent commercial benefits without altering catalog", async () => {
    const companyId = await seedDisposableCompany(`Benefit ${Date.now()}`);
    const subscription = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: launchPlanId,
      billingPlanTierId: launchTierId,
      effectiveFrom: new Date("2027-03-01T00:00:00.000Z"),
      agreedAmount: "300.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      actorUserId: ACTOR_USER_ID,
    });

    const beforePrices = await getPool().request().query(`
      SELECT COUNT(*) AS c FROM dbo.billing_plan_prices
    `);
    const catalogBefore = Number(beforePrices.recordset[0].c);

    await billingCommercialBenefitService.registerCommercialBenefit({
      companyId,
      subscriptionId: subscription.id,
      benefitKind: "PERCENT_DISCOUNT",
      discountPercent: "10",
      finalAgreedAmount: "270",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      effectiveFrom: new Date("2027-04-01T00:00:00.000Z"),
      reason: "Descuento autorizado Q1",
      actorUserId: ACTOR_USER_ID,
      adminRequestKey: `benefit-${randomUUID()}`,
    });

    const afterPrices = await getPool().request().query(`
      SELECT COUNT(*) AS c FROM dbo.billing_plan_prices
    `);
    assert.equal(Number(afterPrices.recordset[0].c), catalogBefore);

    const listing = await billingCommercialBenefitService.listCompanyCommercialBenefits(
      companyId,
      new Date("2027-05-01T00:00:00.000Z"),
    );
    assert.equal(listing.active.length, 1);
    assert.equal(listing.active[0].finalAmount, "270");
    assert.equal(listing.active[0].status, "ACTIVE");
  });

  it("marks ended temporary benefits without agreed successor and keeps idempotent retries", async () => {
    const companyId = await seedDisposableCompany(`Temporal ${Date.now()}`);
    const customPlan = await billingCatalogService.createPlan({
      planCode: `BEN_TEMP_${Date.now().toString(36)}`,
      displayName: "Beneficio temporal",
      planKind: "CUSTOM",
    });
    const subscription = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom: new Date("2027-04-01T00:00:00.000Z"),
      agreedAmount: "300.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      actorUserId: ACTOR_USER_ID,
    });

    const adminRequestKey = `temp-benefit-${randomUUID()}`;
    const benefitStart = new Date("2027-05-01T00:00:00.000Z");
    const benefitEnd = new Date("2027-08-01T00:00:00.000Z");

    const first = await billingCommercialBenefitService.registerCommercialBenefit({
      companyId,
      subscriptionId: subscription.id,
      benefitKind: "FIXED_AMOUNT_DISCOUNT",
      baseAmount: "300.000000",
      discountAmount: "50",
      finalAgreedAmount: "250",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      effectiveFrom: benefitStart,
      effectiveTo: benefitEnd,
      reason: "Promo trimestral",
      actorUserId: ACTOR_USER_ID,
      adminRequestKey,
    });

    const second = await billingCommercialBenefitService.registerCommercialBenefit({
      companyId,
      subscriptionId: subscription.id,
      benefitKind: "FIXED_AMOUNT_DISCOUNT",
      baseAmount: "300.000000",
      discountAmount: "50",
      finalAgreedAmount: "250",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      effectiveFrom: benefitStart,
      effectiveTo: benefitEnd,
      reason: "Promo trimestral",
      actorUserId: ACTOR_USER_ID,
      adminRequestKey,
    });
    assert.equal(first.id, second.id);

    const withoutSuccessor = await billingCommercialBenefitService.listCompanyCommercialBenefits(
      companyId,
      new Date("2027-08-01T00:00:00.000Z"),
    );
    assert.equal(withoutSuccessor.active.length, 0);
    assert.equal(withoutSuccessor.ended.length, 1);
    assert.equal(withoutSuccessor.withoutAgreedSuccessor.length, 1);
    assert.equal(withoutSuccessor.withoutAgreedSuccessor[0].lacksAgreedSuccessor, true);
  });

  it("detects contractual successor across STANDARD to CUSTOM transition", async () => {
    const companyId = await seedDisposableCompany(`Successor transition ${Date.now()}`);
    const standardFrom = new Date("2028-03-01T00:00:00.000Z");
    const standard = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: launchPlanId,
      billingPlanTierId: launchTierId,
      effectiveFrom: standardFrom,
      agreedAmount: "300.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      actorUserId: ACTOR_USER_ID,
    });

    const transitionAt = new Date("2028-06-01T00:00:00.000Z");
    await billingCommercialBenefitService.registerCommercialBenefit({
      companyId,
      subscriptionId: standard.id,
      benefitKind: "PERCENT_DISCOUNT",
      baseAmount: "300.000000",
      discountPercent: "10",
      finalAgreedAmount: "270",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      effectiveFrom: new Date("2028-04-01T00:00:00.000Z"),
      effectiveTo: transitionAt,
      reason: "Beneficio previo a transición",
      actorUserId: ACTOR_USER_ID,
    });

    const customPlan = await billingCatalogService.createPlan({
      planCode: `SUCC_TRANS_${Date.now().toString(36)}`,
      displayName: "Successor transition",
      planKind: "CUSTOM",
    });
    await billingNegotiatedContractService.transitionStandardToCustomNegotiatedAgreement({
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

    const listing = await billingCommercialBenefitService.listCompanyCommercialBenefits(
      companyId,
      transitionAt,
    );
    const endedBenefit = listing.ended.find((row) => row.subscriptionId === standard.id);
    assert.ok(endedBenefit);
    assert.equal(endedBenefit.lacksAgreedSuccessor, false);
    assert.equal(listing.withoutAgreedSuccessor.length, 0);
  });

  it("rejects adminRequestKey reuse when benefits differ but final amount matches", async () => {
    const companyId = await seedDisposableCompany(`Benefit idem payload ${Date.now()}`);
    const customPlan = await billingCatalogService.createPlan({
      planCode: `BEN_IDEM_${Date.now().toString(36)}`,
      displayName: "Idem payload",
      planKind: "CUSTOM",
    });
    const subscription = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom: new Date("2027-09-01T00:00:00.000Z"),
      agreedAmount: "300.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      actorUserId: ACTOR_USER_ID,
    });
    const adminRequestKey = `benefit-idem-${randomUUID()}`;
    const effectiveFrom = new Date("2027-10-01T00:00:00.000Z");

    await billingCommercialBenefitService.registerCommercialBenefit({
      companyId,
      subscriptionId: subscription.id,
      benefitKind: "PERCENT_DISCOUNT",
      baseAmount: "300.000000",
      discountPercent: "10",
      finalAgreedAmount: "270",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      effectiveFrom,
      reason: "Diez por ciento",
      actorUserId: ACTOR_USER_ID,
      adminRequestKey,
    });

    await assert.rejects(
      () =>
        billingCommercialBenefitService.registerCommercialBenefit({
          companyId,
          subscriptionId: subscription.id,
          benefitKind: "FIXED_AMOUNT_DISCOUNT",
          baseAmount: "300.000000",
          discountAmount: "30",
          finalAgreedAmount: "270",
          currency: "USD",
          billingPeriod: "MONTHLY",
          seatMin: 1,
          seatMax: 100,
          effectiveFrom,
          reason: "Treinta fijos",
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

  it("rejects mismatched adminRequestKey payload for benefits", async () => {
    const companyId = await seedDisposableCompany(`Benefit mismatch ${Date.now()}`);
    const customPlan = await billingCatalogService.createPlan({
      planCode: `BEN_MM_${Date.now().toString(36)}`,
      displayName: "Mismatch",
      planKind: "CUSTOM",
    });
    const subscription = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom: new Date("2027-05-01T00:00:00.000Z"),
      agreedAmount: "300.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      actorUserId: ACTOR_USER_ID,
    });
    const adminRequestKey = `benefit-mismatch-${randomUUID()}`;

    await billingCommercialBenefitService.registerCommercialBenefit({
      companyId,
      subscriptionId: subscription.id,
      benefitKind: "FIXED_FINAL_AMOUNT",
      baseAmount: "300.000000",
      finalAgreedAmount: "220",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      effectiveFrom: new Date("2027-06-01T00:00:00.000Z"),
      reason: "Tarifa fija",
      actorUserId: ACTOR_USER_ID,
      adminRequestKey,
    });

    await assert.rejects(
      () =>
        billingCommercialBenefitService.registerCommercialBenefit({
          companyId,
          subscriptionId: subscription.id,
          benefitKind: "FIXED_FINAL_AMOUNT",
          baseAmount: "300.000000",
          finalAgreedAmount: "221",
          currency: "USD",
          billingPeriod: "MONTHLY",
          seatMin: 1,
          seatMax: 100,
          effectiveFrom: new Date("2027-06-01T00:00:00.000Z"),
          reason: "Tarifa fija",
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

  it("preserves strategic company exemption over commercial benefit rows", async () => {
    const strategic = PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS[0];
    const customPlan = await billingCatalogService.createPlan({
      planCode: `STRAT_BEN_${Date.now().toString(36)}`,
      displayName: "Strategic benefit probe",
      planKind: "CUSTOM",
    });
    const subscription = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId: strategic.companyId,
      billingPlanId: customPlan.id,
      effectiveFrom: new Date("2027-06-01T00:00:00.000Z"),
      agreedAmount: "100.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 50,
      actorUserId: ACTOR_USER_ID,
    });

    await billingCommercialBenefitService.registerCommercialBenefit({
      companyId: strategic.companyId,
      subscriptionId: subscription.id,
      benefitKind: "FIXED_FINAL_AMOUNT",
      finalAgreedAmount: "0",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 50,
      effectiveFrom: new Date("2027-07-01T00:00:00.000Z"),
      reason: "Evidencia administrativa",
      actorUserId: ACTOR_USER_ID,
    });

    const policy = await billingPolicyService.getCompanyBillingPolicy(strategic.companyId);
    assert.equal(policy.isExempt, true);
    assert.equal(policy.requiresPayment, false);
  });
});