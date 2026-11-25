import { connectDatabase, closeDatabase, getPool } from "../database/connection";
import { assertTestSqlConnectionAllowed } from "../test-helpers/integration-test-sql-guard";
import { seedIntegrationFixturesOnPool } from "../test-helpers/integration-database-seed";

/**
 * Legacy entrypoint — prefer ephemeral provisioning via `npm run test:integration`.
 * Requires DINAMIC_TEST_SQL_ACTIVE and an ephemeral database.
 */
const main = async (): Promise<void> => {
  await connectDatabase();
  const pool = getPool();
  await assertTestSqlConnectionAllowed(pool);
  try {
    await seedIntegrationFixturesOnPool(pool);
    console.log("CI integration seed completed.");
  } finally {
    await closeDatabase();
  }
};

void main().catch((error: unknown) => {
  console.error("Failed to seed CI integration fixtures:", error);
  process.exit(1);
});