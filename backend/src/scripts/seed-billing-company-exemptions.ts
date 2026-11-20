import { config } from "dotenv";
import { connectDatabase, closeDatabase } from "../database/connection";
import {
  seedProtectedStrategicCompanyExemptions,
  BillingCompanyExemptionSeedError,
} from "../services/billing/billing-company-exemption.seed";
import { assertSafeIntegrationDatabaseTarget } from "../test-helpers/integration-test";
import { ensureBillingCompanyExemptionsMigration } from "../test-helpers/ensure-billing-company-exemptions-migration";

config();

const main = async (): Promise<void> => {
  if (process.env.BILLING_EXEMPTION_SEED_ALLOWED !== "true") {
    throw new Error(
      "Refusing billing exemption seed: set BILLING_EXEMPTION_SEED_ALLOWED=true on a disposable database only.",
    );
  }
  assertSafeIntegrationDatabaseTarget();

  await connectDatabase();
  try {
    await ensureBillingCompanyExemptionsMigration();
    const results = await seedProtectedStrategicCompanyExemptions();
    console.log(
      JSON.stringify(
        {
          status: "ok",
          results,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error instanceof BillingCompanyExemptionSeedError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await closeDatabase();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});