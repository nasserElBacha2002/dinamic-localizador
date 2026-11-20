import { config } from "dotenv";
import { connectDatabase, closeDatabase } from "../database/connection";
import {
  BillingLaunchPlanSeedError,
  seedBillingLaunchPlan,
} from "../services/billing/billing-launch-plan.seed";
import { assertSafeIntegrationDatabaseTarget } from "../test-helpers/integration-test";
import { ensureBillingPlanPublicOfferingMigration } from "../test-helpers/ensure-billing-plan-public-offering-migration";

config();

const main = async (): Promise<void> => {
  if (process.env.BILLING_LAUNCH_PLAN_SEED_ALLOWED !== "true") {
    throw new Error(
      "Refusing billing launch plan seed: set BILLING_LAUNCH_PLAN_SEED_ALLOWED=true on a disposable database only.",
    );
  }
  assertSafeIntegrationDatabaseTarget();

  await connectDatabase();
  try {
    await ensureBillingPlanPublicOfferingMigration();
    const result = await seedBillingLaunchPlan();
    console.log(
      JSON.stringify(
        {
          status: "ok",
          result,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error instanceof BillingLaunchPlanSeedError) {
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