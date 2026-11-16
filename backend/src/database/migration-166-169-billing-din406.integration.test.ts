/**
 * DIN-406 Fase 2B/2C — migrations 166–169 on ephemeral SQL Server.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getPool } from "../database/connection";
import { getAppliedMigrations } from "../database/run-migrations";
import { assertBillingCompanyExemptionsImmutabilityTriggerEnabled } from "../utils/billing/billing-company-exemption-schema";
import { isDatabaseIntegrationEnabled } from "../test-helpers/integration-test";
import {
  activateEphemeralBillingExemptionDatabase,
  createEphemeralBillingExemptionDatabase,
  destroyEphemeralBillingExemptionDatabase,
  type EphemeralBillingExemptionHandle,
} from "../test-helpers/ephemeral-billing-exemption-database";

const ephemeralEnabled =
  isDatabaseIntegrationEnabled() && process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED === "true";
const describeEphemeral = ephemeralEnabled ? describe : describe.skip;

describeEphemeral("migrations 166–169 billing DIN-406", () => {
  let ephemeral: EphemeralBillingExemptionHandle;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
    assert.equal(ephemeral.evidence.destroyed, true);
  });

  it("registers migrations 166–169 in system_migrations", async () => {
    const applied = await getAppliedMigrations(getPool());
    assert.equal(applied.has("166_billing_admin_idempotency_digest_exemption_immutability.sql"), true);
    assert.equal(applied.has("167_billing_company_exemptions_immutability_hardening.sql"), true);
    assert.equal(applied.has("168_billing_subscription_term_commercial_benefit.sql"), true);
    assert.equal(applied.has("169_billing_company_exemptions_immutability_complete.sql"), true);
  });

  it("defines idempotency digest and commercial benefit columns", async () => {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT 1 AS found
      WHERE COL_LENGTH(N'dbo.billing_subscription_terms', N'admin_request_idempotency_digest') IS NOT NULL
        AND COL_LENGTH(N'dbo.billing_subscriptions', N'admin_request_idempotency_digest') IS NOT NULL
        AND COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_kind') IS NOT NULL
        AND COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_base_amount') IS NOT NULL
        AND COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_discount_percent') IS NOT NULL
        AND COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_discount_amount') IS NOT NULL
        AND COL_LENGTH(N'dbo.billing_subscription_terms', N'commercial_benefit_reason') IS NOT NULL
    `);
    assert.ok(result.recordset[0]);
  });

  it("enables exemption immutability trigger", async () => {
    await assertBillingCompanyExemptionsImmutabilityTriggerEnabled(getPool());
  });
});