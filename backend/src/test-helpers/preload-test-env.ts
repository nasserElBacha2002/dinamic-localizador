import {
  FORCE_UNIT_TEST_ENV_KEYS,
  setupUnitTestEnv,
  UNIT_TEST_ENV_DEFAULTS,
} from "./unit-test-env";
import { UNIT_TEST_SQL_PLACEHOLDER } from "./test-sql-credentials";

/**
 * Test preload — never use backend/.env DB_* for SQL.
 * Integration credentials come from TEST_DB_* set by the integration runner after provisioning.
 */
if (process.env.RUN_DB_INTEGRATION_TESTS === "true") {
  for (const [key, value] of Object.entries(UNIT_TEST_ENV_DEFAULTS)) {
    if (key.startsWith("DB_") || key === "JWT_SECRET") {
      continue;
    }
    if (!process.env[key] || FORCE_UNIT_TEST_ENV_KEYS.has(key)) {
      process.env[key] = value;
    }
  }
  process.env.EMAIL_TRANSPORT = "console";
} else {
  setupUnitTestEnv();
  for (const [key, value] of Object.entries(UNIT_TEST_SQL_PLACEHOLDER)) {
    process.env[key] = value;
  }
}