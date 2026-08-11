import { config } from "dotenv";
import {
  FORCE_UNIT_TEST_ENV_KEYS,
  setupUnitTestEnv,
  UNIT_TEST_ENV_DEFAULTS,
} from "./unit-test-env";

// Load local .env first so integration runs keep real DB credentials.
config();

if (process.env.RUN_DB_INTEGRATION_TESTS === "true") {
  // Keep DB_*/JWT from .env or CI; force test-safe gates (NODE_ENV, Twilio flags, SIDs)
  // so a local production-like .env cannot break Zod startup validation.
  for (const [key, value] of Object.entries(UNIT_TEST_ENV_DEFAULTS)) {
    if (key.startsWith("DB_") || key === "JWT_SECRET") {
      continue;
    }
    if (!process.env[key] || FORCE_UNIT_TEST_ENV_KEYS.has(key)) {
      process.env[key] = value;
    }
  }
  // Never deliver real email during integration.
  process.env.EMAIL_TRANSPORT = "console";
} else {
  setupUnitTestEnv();
}
