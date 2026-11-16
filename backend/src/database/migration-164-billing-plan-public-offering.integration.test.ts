/**
 * DIN-406 Fase 2A — migration 164 billing plan public offering.
 */
import { after, before, it } from "node:test";
import { getPool } from "../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { ensureBillingPlanPublicOfferingMigration } from "../test-helpers/ensure-billing-plan-public-offering-migration";
import { assertBillingPlanPublicOfferingSchemaIntegrity } from "../utils/billing/billing-plan-public-offering-schema";

describeDatabaseIntegration("migration 164 billing plan public offering", () => {
  before(async () => {
    await setupDatabaseIntegration();
    await ensureBillingPlanPublicOfferingMigration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("defines is_public_for_new_subscription with expected migration registration", async () => {
    await assertBillingPlanPublicOfferingSchemaIntegrity(getPool());
  });
});