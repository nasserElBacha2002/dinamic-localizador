/**
 * DIN-406 Fase 2B — negotiated agreements and manual contractual modifications (ephemeral SQL).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import { PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS } from "../../constants/billing-company-exemption";
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
import { normalizeDecimalString } from "../../utils/money-decimal";
import { billingCatalogService } from "./billing-catalog.service";
import { billingCommercialAdminService } from "./billing-commercial-admin.service";
import { seedBillingLaunchPlan } from "./billing-launch-plan.seed";
import { billingNegotiatedContractService } from "./billing-negotiated-contract.service";
import { billingPolicyService } from "./billing-policy.service";
import { billingSubscriptionService } from "./billing-subscription.service";
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

describeEphemeral("billing negotiated contract ephemeral SQL proofs", () => {
  let ephemeral: EphemeralBillingExemptionHandle;
  let launchPlanId: string;
  let launchTierId: string;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);

    await getPool()
      .request()
      .input("userId", sql.UniqueIdentifier, ACTOR_USER_ID)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE id = @userId)
        BEGIN
          INSERT INTO dbo.users (id, name, email, password_hash, role, active)
          VALUES (
            @userId,
            N'Commercial Admin',
            N'commercial-admin-2b@test.local',
            N'x',
            N'ADMIN',
            1
          );
        END
      `);

    const launch = await seedBillingLaunchPlan({ strictInitialPrice: true });
    launchPlanId = launch.planId;
    launchTierId = launch.tierId;
    await seedProtectedStrategicCompanyExemptions();
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
    assert.equal(ephemeral.evidence.destroyed, true);
  });

  it("keeps standard launch contract at USD 300 for 100 seats without employee-based recalculation", async () => {
    const companyId = await seedDisposableCompany(`Launch std ${Date.now()}`);
    const effectiveFrom = new Date("2026-06-01T00:00:00.000Z");
    const created = await billingNegotiatedContractService.createNegotiatedAgreement({
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
      commercialReference: "Contrato público inicial",
    });

    const terms = await billingSubscriptionService.getCurrentTerms(
      created.id,
      new Date("2027-06-01T00:00:00.000Z"),
    );
    assert.ok(terms);
    assert.equal(normalizeDecimalString(terms.agreedAmount), "300");
  });

  it("allows CUSTOM negotiated capacity 180 with independent amount", async () => {
    const customPlan = await billingCatalogService.createPlan({
      planCode: `CUSTOM_180_${Date.now().toString(36)}`,
      displayName: "Negociado 180",
      planKind: "CUSTOM",
    });
    const companyId = await seedDisposableCompany(`Custom 180 ${Date.now()}`);
    const effectiveFrom = new Date("2026-07-01T00:00:00.000Z");
    const created = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom,
      agreedAmount: "550.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 180,
      actorUserId: ACTOR_USER_ID,
    });
    const current = await billingSubscriptionService.getCurrentTerms(created.id, effectiveFrom);
    assert.equal(current?.seatMax, 180);
    assert.equal(normalizeDecimalString(current?.agreedAmount ?? ""), "550");
  });

  it("allows exceptional CUSTOM terms below 100 seats", async () => {
    const customPlan = await billingCatalogService.createPlan({
      planCode: `CUSTOM_80_${Date.now().toString(36)}`,
      displayName: "Excepcional 80",
      planKind: "CUSTOM",
    });
    const companyId = await seedDisposableCompany(`Custom 80 ${Date.now()}`);
    const effectiveFrom = new Date("2026-08-01T00:00:00.000Z");
    await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom,
      agreedAmount: "220.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 80,
      actorUserId: ACTOR_USER_ID,
    });
    const view = await billingNegotiatedContractService.getCompanyCommercialContracts(
      companyId,
      effectiveFrom,
    );
    assert.equal(view.isCustomPlan, true);
    assert.equal(view.currentTerms?.seatMax, 80);
  });

  it("versions price from 300 to 350 without rewriting history", async () => {
    const companyId = await seedDisposableCompany(`Price mod ${Date.now()}`);
    const effectiveFrom = new Date("2026-09-01T00:00:00.000Z");
    const created = await billingNegotiatedContractService.createNegotiatedAgreement({
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
    const changeAt = new Date("2027-01-01T00:00:00.000Z");
    await billingNegotiatedContractService.modifyContractualTerms({
      subscriptionId: created.id,
      companyId,
      agreedAmount: "350.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 100,
      effectiveFrom: changeAt,
      actorUserId: ACTOR_USER_ID,
      commercialReference: "Aumento autorizado",
    });
    const history = await billingSubscriptionService.listTermsHistory(created.id);
    assert.equal(history.length, 2);
    const oldTerm = history.find((term) => term.effectiveTo != null);
    assert.equal(normalizeDecimalString(oldTerm?.agreedAmount ?? ""), "300");
    const active = await billingSubscriptionService.getCurrentTerms(created.id, changeAt);
    assert.equal(normalizeDecimalString(active?.agreedAmount ?? ""), "350");
  });

  it("does not change contractual rows when catalog public price is updated", async () => {
    const companyId = await seedDisposableCompany(`Catalog isolation ${Date.now()}`);
    const effectiveFrom = new Date("2026-10-01T00:00:00.000Z");
    const created = await billingNegotiatedContractService.createNegotiatedAgreement({
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

    await billingCommercialAdminService.publishCatalogPriceVersion({
      billingPlanTierId: launchTierId,
      amount: "350.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      effectiveFrom: new Date("2027-02-01T00:00:00.000Z"),
    });

    const terms = await billingSubscriptionService.getCurrentTerms(
      created.id,
      new Date("2027-06-01T00:00:00.000Z"),
    );
    assert.equal(normalizeDecimalString(terms?.agreedAmount ?? ""), "300");
  });

  it("rejects overlapping term windows", async () => {
    const companyId = await seedDisposableCompany(`Overlap ${Date.now()}`);
    const effectiveFrom = new Date("2026-11-01T00:00:00.000Z");
    const customPlan = await billingCatalogService.createPlan({
      planCode: `CUSTOM_OV_${Date.now().toString(36)}`,
      displayName: "Overlap",
      planKind: "CUSTOM",
    });
    const created = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom,
      agreedAmount: "400.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 120,
      actorUserId: ACTOR_USER_ID,
    });

    await assert.rejects(
      () =>
        billingNegotiatedContractService.modifyContractualTerms({
          subscriptionId: created.id,
          companyId,
          agreedAmount: "410.000000",
          currency: "USD",
          billingPeriod: "MONTHLY",
          seatMin: 1,
          seatMax: 120,
          effectiveFrom,
          actorUserId: ACTOR_USER_ID,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_TERM_OVERLAP");
        return true;
      },
    );
  });

  it("returns the same term when admin request key is retried", async () => {
    const companyId = await seedDisposableCompany(`Idempotent ${Date.now()}`);
    const customPlan = await billingCatalogService.createPlan({
      planCode: `CUSTOM_IDEM_${Date.now().toString(36)}`,
      displayName: "Idem",
      planKind: "CUSTOM",
    });
    const effectiveFrom = new Date("2026-12-01T00:00:00.000Z");
    const adminRequestKey = `idem-${randomUUID()}`;
    const first = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom,
      agreedAmount: "500.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 150,
      actorUserId: ACTOR_USER_ID,
      adminRequestKey,
    });
    const second = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom,
      agreedAmount: "500.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 150,
      actorUserId: ACTOR_USER_ID,
      adminRequestKey,
    });
    assert.equal(first.id, second.id);
    assert.equal(first.terms[0]?.id, second.terms[0]?.id);
  });

  it("rejects cross-company modification", async () => {
    const companyA = await seedDisposableCompany(`Company A ${Date.now()}`);
    const companyB = await seedDisposableCompany(`Company B ${Date.now()}`);
    const customPlan = await billingCatalogService.createPlan({
      planCode: `CUSTOM_XCOMP_${Date.now().toString(36)}`,
      displayName: "Cross",
      planKind: "CUSTOM",
    });
    const created = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId: companyA,
      billingPlanId: customPlan.id,
      effectiveFrom: new Date("2027-03-01T00:00:00.000Z"),
      agreedAmount: "600.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 120,
      actorUserId: ACTOR_USER_ID,
    });

    await assert.rejects(
      () =>
        billingNegotiatedContractService.modifyContractualTerms({
          subscriptionId: created.id,
          companyId: companyB,
          agreedAmount: "610.000000",
          currency: "USD",
          billingPeriod: "MONTHLY",
          seatMin: 1,
          seatMax: 120,
          effectiveFrom: new Date("2027-06-01T00:00:00.000Z"),
          actorUserId: ACTOR_USER_ID,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "BILLING_SUBSCRIPTION_COMPANY_MISMATCH");
        return true;
      },
    );
  });

  it("persists actor in term row and audit log", async () => {
    const companyId = await seedDisposableCompany(`Audit ${Date.now()}`);
    const customPlan = await billingCatalogService.createPlan({
      planCode: `CUSTOM_AUDIT_${Date.now().toString(36)}`,
      displayName: "Audit",
      planKind: "CUSTOM",
    });
    const created = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: customPlan.id,
      effectiveFrom: new Date("2027-04-01T00:00:00.000Z"),
      agreedAmount: "700.000000",
      currency: "USD",
      billingPeriod: "MONTHLY",
      seatMin: 1,
      seatMax: 90,
      actorUserId: ACTOR_USER_ID,
      commercialReference: "Ref comercial QA",
    });
    assert.equal(created.terms[0]?.createdByUserId?.toUpperCase(), ACTOR_USER_ID.toUpperCase());
    assert.equal(created.terms[0]?.commercialReference, "Ref comercial QA");

    const logs = await auditService.listByEntity(
      companyId,
      "billing_subscription",
      created.id,
      1,
      20,
    );
    assert.ok(logs.items.some((entry) => entry.action === "COMMERCIAL_NEGOTIATED_AGREEMENT_CREATED"));
    assert.equal(logs.items[0]?.userId?.toUpperCase(), ACTOR_USER_ID.toUpperCase());
  });

  it("preserves strategic company exemption policy", async () => {
    for (const entry of PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS) {
      const policy = await billingPolicyService.getCompanyBillingPolicy(entry.companyId);
      assert.equal(policy.isExempt, true);
      assert.equal(policy.requiresPayment, false);
      assert.equal(policy.enforceSeatLimit, false);
    }
  });
});