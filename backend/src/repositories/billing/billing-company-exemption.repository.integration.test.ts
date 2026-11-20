/**
 * Billing company exemption repository — SQL transaction behavior.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../../database/connection";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { ensureBillingCompanyExemptionsMigration } from "../../test-helpers/ensure-billing-company-exemptions-migration";
import { createPlatformCompanyFixture } from "../../test-helpers/platform-company-fixture";
import { billingCompanyExemptionRepository } from "./billing-company-exemption.repository";

const uniqueSuffix = () => Date.now().toString(36);

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

describeDatabaseIntegration("billing company exemption repository transactions", () => {
  const fixtures = createIntegrationFixtureTracker();

  before(async () => {
    await setupDatabaseIntegration();
    await ensureBillingCompanyExemptionsMigration();
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const seedCompany = async () => {
    const suffix = uniqueSuffix();
    const fixture = await createPlatformCompanyFixture({
      name: `Exemption Repo Co ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Exemption Repo Owner",
        email: `exemption-repo-${suffix}@test.local`,
      },
    });
    fixtures.trackCompany(fixture.data.company.id);
    return fixture.data.company;
  };

  it("rolls back all writes when a later insert in the same transaction fails", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    assert.equal(await countPermanentForCompany(companyA.id), 0);
    assert.equal(await countPermanentForCompany(companyB.id), 0);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction).query(`SET XACT_ABORT ON;`);
    await billingCompanyExemptionRepository.insertPermanentIfAbsentInTransaction(transaction, {
      companyId: companyA.id,
      exemptionReason: "Rollback probe A",
      createdSource: "DISPOSABLE_SEED",
    });

    const bogusUserId = "00000000-0000-0000-0000-000000000099";
    await assert.rejects(
      () =>
        billingCompanyExemptionRepository.insertPermanentIfAbsentInTransaction(transaction, {
          companyId: companyB.id,
          exemptionReason: "Rollback probe B",
          createdSource: "DISPOSABLE_SEED",
          createdByUserId: bogusUserId,
        }),
      (error: unknown) => {
        assert.match(String(error), /FK_billing_company_exemptions_created_by|foreign key/i);
        return true;
      },
    );

    try {
      await transaction.rollback();
    } catch {
      // Transaction may already be aborted under XACT_ABORT.
    }

    assert.equal(await countPermanentForCompany(companyA.id), 0);
    assert.equal(await countPermanentForCompany(companyB.id), 0);
  });

});