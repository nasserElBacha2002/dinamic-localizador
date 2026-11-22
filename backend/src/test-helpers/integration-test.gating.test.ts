import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConnectionPool } from "mssql";
import {
  assertSafeIntegrationDatabaseTarget,
  isDatabaseIntegrationEnabled,
} from "./integration-test";
import { assertIntegrationDatabaseNameIsEphemeral } from "./test-sql-server-guard";
import { assertSafeIntegrationDatabaseConnectedTarget } from "./integration-test-sql-guard";
import { generateEphemeralIntegrationDatabaseName } from "./ephemeral-database-names";
import { assertTestSqlDisposableEnvironmentConfigured } from "./test-sql-disposable-env";

describe("database integration gating (DIN-462)", () => {
  const originalFlag = process.env.RUN_DB_INTEGRATION_TESTS;

  it("is disabled unless ephemeral session is provisioned", () => {
    delete process.env.RUN_DB_INTEGRATION_TESTS;
    delete process.env.DINAMIC_TEST_SQL_ACTIVE;
    assert.equal(isDatabaseIntegrationEnabled(), false);

    process.env.RUN_DB_INTEGRATION_TESTS = "true";
    process.env.DINAMIC_TEST_SQL_ACTIVE = "true";
    process.env.TEST_DB_HOST = "localhost";
    process.env.TEST_DB_PORT = "1433";
    process.env.TEST_DB_USER = "sa";
    process.env.TEST_DB_PASSWORD = "test-password";
    process.env.TEST_SQL_DISPOSABLE_ACKNOWLEDGED = "true";
    process.env.TEST_SQL_ALLOW_SYSTEM_ADMIN = "true";
    process.env.TEST_SQL_ALLOWED_SERVER_NAME = "ci-disposable-sql";
    process.env.JWT_SECRET = "test-jwt-secret-min-16";
    process.env.FRONTEND_URL = "http://localhost:5173";
    process.env.TZ = "America/Argentina/Buenos_Aires";
    process.env.DINAMIC_INTEGRATION_DATABASE_NAME = generateEphemeralIntegrationDatabaseName();
    assert.equal(isDatabaseIntegrationEnabled(), true);
  });

  it("rejects protected persistent database names", () => {
    assert.throws(() => assertIntegrationDatabaseNameIsEphemeral("dinamic_attendance"), /protected/);
    assert.throws(
      () => assertIntegrationDatabaseNameIsEphemeral("production_attendance"),
      /din_test_<uuid>/,
    );
    assert.doesNotThrow(() =>
      assertIntegrationDatabaseNameIsEphemeral(generateEphemeralIntegrationDatabaseName()),
    );
  });

  it("requires disposable acknowledgement and allowed server identity", () => {
    delete process.env.TEST_SQL_DISPOSABLE_ACKNOWLEDGED;
    delete process.env.TEST_SQL_ALLOWED_SERVER_NAME;
    assert.throws(() => assertTestSqlDisposableEnvironmentConfigured(), /TEST_SQL_DISPOSABLE_ACKNOWLEDGED/);

    process.env.TEST_SQL_DISPOSABLE_ACKNOWLEDGED = "true";
    assert.throws(() => assertTestSqlDisposableEnvironmentConfigured(), /TEST_SQL_ALLOWED_SERVER_NAME/);
  });

  it("rejects integration DDL without ephemeral session and explicit flags", () => {
    const keys = [
      "RUN_DB_INTEGRATION_TESTS",
      "INTEGRATION_SQL_DDL_ALLOWED",
      "DINAMIC_TEST_SQL_ACTIVE",
      "NODE_ENV",
      "DB_NAME",
      "DINAMIC_INTEGRATION_DATABASE_NAME",
    ] as const;
    const envBackup = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

    process.env.RUN_DB_INTEGRATION_TESTS = "true";
    process.env.NODE_ENV = "test";
    process.env.DB_NAME = generateEphemeralIntegrationDatabaseName();
    process.env.DINAMIC_INTEGRATION_DATABASE_NAME = process.env.DB_NAME;

    delete process.env.INTEGRATION_SQL_DDL_ALLOWED;
    delete process.env.DINAMIC_TEST_SQL_ACTIVE;
    assert.throws(() => assertSafeIntegrationDatabaseTarget(), /DINAMIC_TEST_SQL_ACTIVE|INTEGRATION_SQL_DDL_ALLOWED/);

    process.env.INTEGRATION_SQL_DDL_ALLOWED = "true";
    process.env.DINAMIC_TEST_SQL_ACTIVE = "true";
    assert.doesNotThrow(() => assertSafeIntegrationDatabaseTarget());

    process.env.DB_NAME = "dinamic_attendance";
    process.env.DINAMIC_INTEGRATION_DATABASE_NAME = "dinamic_attendance";
    assert.throws(() => assertSafeIntegrationDatabaseTarget(), /protected|din_test_/);

    for (const key of keys) {
      if (envBackup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envBackup[key];
      }
    }
  });

  it("rejects connected SQL when DB_NAME() does not match configured target", async () => {
    const keys = [
      "RUN_DB_INTEGRATION_TESTS",
      "INTEGRATION_SQL_DDL_ALLOWED",
      "DINAMIC_TEST_SQL_ACTIVE",
      "NODE_ENV",
      "DB_NAME",
      "DINAMIC_INTEGRATION_DATABASE_NAME",
      "TEST_DB_HOST",
      "TEST_DB_PORT",
      "TEST_DB_USER",
      "TEST_DB_PASSWORD",
      "TEST_SQL_DISPOSABLE_ACKNOWLEDGED",
      "TEST_SQL_ALLOWED_SERVER_NAME",
    ] as const;
    const envBackup = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const ephemeralName = generateEphemeralIntegrationDatabaseName();

    process.env.RUN_DB_INTEGRATION_TESTS = "true";
    process.env.INTEGRATION_SQL_DDL_ALLOWED = "true";
    process.env.DINAMIC_TEST_SQL_ACTIVE = "true";
    process.env.NODE_ENV = "test";
    process.env.DB_NAME = ephemeralName;
    process.env.DINAMIC_INTEGRATION_DATABASE_NAME = ephemeralName;
    process.env.TEST_DB_HOST = "localhost";
    process.env.TEST_DB_PORT = "1433";
    process.env.TEST_DB_USER = "sa";
    process.env.TEST_DB_PASSWORD = "test-password";
    process.env.TEST_SQL_DISPOSABLE_ACKNOWLEDGED = "true";
    process.env.TEST_SQL_ALLOWED_SERVER_NAME = "ci-disposable-sql";

    const mismatchedPool = {
      request: () => ({
        query: async (sqlText: string) => {
          if (sqlText.includes("DB_NAME()")) {
            return { recordset: [{ connected_database: "other_database" }] };
          }
          if (sqlText.includes("@@SERVERNAME")) {
            return {
              recordset: [{ server_name: "ci-disposable-sql", server_fqdn: "ci-disposable-sql", connected_database: "other_database" }],
            };
          }
          return { recordset: [{ found: 1 }] };
        },
      }),
    } as unknown as ConnectionPool;

    await assert.rejects(
      () => assertSafeIntegrationDatabaseConnectedTarget(mismatchedPool),
      /DB_NAME\(\)|server identity/,
    );

    for (const key of keys) {
      if (envBackup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envBackup[key];
      }
    }
  });

  it("restores RUN_DB_INTEGRATION_TESTS", () => {
    if (originalFlag === undefined) {
      delete process.env.RUN_DB_INTEGRATION_TESTS;
      return;
    }
    process.env.RUN_DB_INTEGRATION_TESTS = originalFlag;
  });
});