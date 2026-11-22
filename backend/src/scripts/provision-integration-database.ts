import { provisionIntegrationTestDatabase } from "../test-helpers/integration-database-lifecycle";

void provisionIntegrationTestDatabase()
  .then((session) => {
    console.log(
      `[provision-integration-database] ready database=${session.handle.evidence.databaseName}`,
    );
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("Failed to provision integration test database:", error);
    process.exit(1);
  });