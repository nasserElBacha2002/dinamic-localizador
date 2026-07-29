import { config } from "dotenv";
import { setupUnitTestEnv } from "./unit-test-env";

// Load local .env first so integration runs keep real DB credentials.
config();

// Unit tests need defaults; integration must use real DB_* from .env / CI secrets.
if (process.env.RUN_DB_INTEGRATION_TESTS !== "true") {
  setupUnitTestEnv();
}
