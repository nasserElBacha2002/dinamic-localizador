/**
 * DIN-406 Fase 1C — commercial billing policy (no persistent exemption fixtures).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../../database/connection";
import { PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS } from "../../constants/billing-company-exemption";
import { companyRepository } from "../../repositories/companies/company.repository";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { ensureBillingCompanyExemptionsMigration } from "../../test-helpers/ensure-billing-company-exemptions-migration";
import { createPlatformCompanyFixture } from "../../test-helpers/platform-company-fixture";
import { billingCatalogService } from "./billing-catalog.service";
import { billingPolicyService } from "./billing-policy.service";
import { billingSubscriptionService } from "./billing-subscription.service";

const uniqueSuffix = () => Date.now().toString(36);

const countAllDisposableSeedExemptions = async (): Promise<number> => {
  const result = await getPool().request().query(`
    SELECT COUNT(*) AS c
    FROM dbo.billing_company_exemptions
    WHERE created_source = N'DISPOSABLE_SEED'
  `);
  return Number(result.recordset[0].c);
};

describeDatabaseIntegration("billing policy and company exemptions", () => {
  const createdPlanIds: string[] = [];
  const createdSubscriptionIds: string[] = [];
  const fixtures = createIntegrationFixtureTracker();
  let disposableSeedExemptionBaseline = 0;

  before(async () => {
    await setupDatabaseIntegration();
    await ensureBillingCompanyExemptionsMigration();
    disposableSeedExemptionBaseline = await countAllDisposableSeedExemptions();
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

    await fixtures.cleanup();

    assert.equal(
      await countAllDisposableSeedExemptions(),
      disposableSeedExemptionBaseline,
      "suite must not introduce DISPOSABLE_SEED exemption rows",
    );

    await teardownDatabaseIntegration();
  });

  const seedRegularCompany = async () => {
    const suffix = uniqueSuffix();
    const fixture = await createPlatformCompanyFixture({
      name: `Billing Policy Co ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Billing Policy Owner",
        email: `billing-policy-${suffix}@test.local`,
      },
    });
    fixtures.trackCompany(fixture.data.company.id);
    return fixture.data.company;
  };

  it("returns strategic exempt policy for all protected UUIDs before any SQL seed row", async () => {
    for (const entry of PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS) {
      const policy = await billingPolicyService.getCompanyBillingPolicy(entry.companyId);
      assert.equal(policy.isExempt, true);
      assert.equal(policy.requiresPayment, false);
      assert.equal(policy.enforceSeatLimit, false);
      assert.equal(policy.allowCommercialSuspension, false);
      assert.match(policy.exemptionReason ?? "", /estratégica/i);
      assert.equal(policy.companyId, entry.companyId.toUpperCase());
    }
  });

  it("returns default commercial policy for non-exempt companies without operational blocks", async () => {
    const company = await seedRegularCompany();
    const before = await companyRepository.findById(company.id);
    assert.ok(before);

    const policy = await billingPolicyService.getCompanyBillingPolicy(company.id);
    assert.equal(policy.isExempt, false);
    assert.equal(policy.exemptionReason, null);
    assert.equal(policy.requiresPayment, true);
    assert.equal(policy.enforceSeatLimit, true);
    assert.equal(policy.allowCommercialSuspension, false);

    const after = await companyRepository.findById(company.id);
    assert.ok(after);
    assert.equal(after.status, before.status);
    assert.equal(after.updatedAt, before.updatedAt);
  });

  it("does not expose another tenant exemption when querying policy", async () => {
    const strategic = PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS[0];
    const companyB = await seedRegularCompany();

    const policyA = await billingPolicyService.getCompanyBillingPolicy(strategic.companyId);
    const policyB = await billingPolicyService.getCompanyBillingPolicy(companyB.id);

    assert.equal(policyA.isExempt, true);
    assert.equal(policyB.isExempt, false);
    assert.equal(policyB.exemptionReason, null);
    assert.notEqual(policyA.companyId, policyB.companyId);
  });

  it("keeps commercial billing policy when a regular company gets a subscription", async () => {
    const company = await seedRegularCompany();
    const plan = await billingCatalogService.createPlan({
      planCode: `COMM-${uniqueSuffix()}`,
      displayName: "Plan contrato test",
      planKind: "STANDARD",
    });
    createdPlanIds.push(plan.id);
    const tier = await billingCatalogService.createTier(plan.id, {
      tierCode: "C50",
      displayName: "Hasta 50",
      seatMin: 1,
      seatMax: 50,
    });

    const subscription = await billingSubscriptionService.createAdminSubscription({
      companyId: company.id,
      billingPlanId: plan.id,
      billingPlanTierId: tier.id,
      subscriptionStatus: "ACTIVE",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      initialTerms: {
        agreedAmount: "199",
        currency: "USD",
        billingPeriod: "MONTHLY",
        seatMin: 1,
        seatMax: 50,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    createdSubscriptionIds.push(subscription.id);

    const policy = await billingPolicyService.getCompanyBillingPolicy(company.id);
    assert.equal(policy.isExempt, false);
    assert.equal(policy.requiresPayment, true);
    assert.equal(policy.enforceSeatLimit, true);
    assert.equal(policy.allowCommercialSuspension, false);
  });

});