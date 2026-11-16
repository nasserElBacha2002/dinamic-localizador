/**
 * Migration 165 — disposable SQL only (no DDL on shared integration DB).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getPool } from "../database/connection";
import { getAppliedMigrations } from "./run-migrations";
import { isDatabaseIntegrationEnabled } from "../test-helpers/integration-test";
import {
  activateEphemeralBillingExemptionDatabase,
  createEphemeralBillingExemptionDatabase,
  destroyEphemeralBillingExemptionDatabase,
  type EphemeralBillingExemptionHandle,
} from "../test-helpers/ephemeral-billing-exemption-database";
import { assertBillingSubscriptionCommercialAuditSchemaIntegrity } from "../utils/billing/billing-subscription-commercial-audit-schema";

const ephemeralEnabled =
  isDatabaseIntegrationEnabled() && process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED === "true";
const describeEphemeral = ephemeralEnabled ? describe : describe.skip;

describeEphemeral("migration 165 billing subscription term commercial audit (ephemeral only)", () => {
  let ephemeral: EphemeralBillingExemptionHandle;

  before(async () => {
    ephemeral = await createEphemeralBillingExemptionDatabase();
    await activateEphemeralBillingExemptionDatabase(ephemeral);
  });

  after(async () => {
    await destroyEphemeralBillingExemptionDatabase(ephemeral);
    assert.equal(ephemeral.evidence.destroyed, true);
  });

  it("registers migration 165 with full commercial audit schema and indexes", async () => {
    const pool = getPool();
    const applied = await getAppliedMigrations(pool);
    assert.equal(
      applied.has("165_billing_subscription_term_commercial_audit.sql"),
      true,
      "expected migration 165 registered during ephemeral bootstrap",
    );
    await assertBillingSubscriptionCommercialAuditSchemaIntegrity(pool, applied);
  });
});