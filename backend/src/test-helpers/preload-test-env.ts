import { config } from "dotenv";
import { setupUnitTestEnv, UNIT_TEST_ENV_DEFAULTS } from "./unit-test-env";

// Load local .env first so integration runs keep real DB credentials.
config();

if (process.env.RUN_DB_INTEGRATION_TESTS === "true") {
  // Keep DB_*/JWT from .env or CI; fill non-DB defaults (Twilio, etc.).
  for (const [key, value] of Object.entries(UNIT_TEST_ENV_DEFAULTS)) {
    if (key.startsWith("DB_") || key === "JWT_SECRET") {
      continue;
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  // Never deliver real email during integration.
  process.env.EMAIL_TRANSPORT = "console";
} else {
  setupUnitTestEnv();
}
