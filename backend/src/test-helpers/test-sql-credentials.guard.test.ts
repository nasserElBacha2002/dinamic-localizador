import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTestSqlCredentials } from "./test-sql-credentials";

describe("test SQL credentials (DIN-462)", () => {
  it("rejects missing TEST_DB_*", () => {
    const keys = [
      "TEST_DB_HOST",
      "TEST_DB_PORT",
      "TEST_DB_USER",
      "TEST_DB_PASSWORD",
      "TEST_SQL_DISPOSABLE_ACKNOWLEDGED",
      "TEST_SQL_ALLOWED_SERVER_NAME",
      "TEST_SQL_ALLOW_SYSTEM_ADMIN",
    ] as const;
    const backup = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

    process.env.TEST_SQL_DISPOSABLE_ACKNOWLEDGED = "true";
    process.env.TEST_SQL_ALLOWED_SERVER_NAME = "unit-test-disposable-sql";
    process.env.TEST_SQL_ALLOW_SYSTEM_ADMIN = "true";
    process.env.TEST_DB_HOST = "sql-disposable.example";
    process.env.TEST_DB_PORT = "1433";
    process.env.TEST_DB_USER = "integration_test";
    process.env.TEST_DB_PASSWORD = "integration-test-password";

    delete process.env.TEST_DB_HOST;
    assert.throws(() => resolveTestSqlCredentials(), /TEST_DB_HOST/);

    for (const key of keys) {
      if (backup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = backup[key];
      }
    }
  });
});