import { teardownIntegrationTestDatabaseFromSessionFile } from "../test-helpers/integration-database-lifecycle";

void teardownIntegrationTestDatabaseFromSessionFile()
  .then(() => {
    console.log("[teardown-integration-database] completed");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("Failed to teardown integration test database:", error);
    process.exit(1);
  });