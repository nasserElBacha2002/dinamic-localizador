import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConnectionPool } from "mssql";
import {
  assertSafeIntegrationDatabaseConnectedTarget,
  assertSafeIntegrationDatabaseTarget,
  INTEGRATION_DATABASE_NAME,
  isDatabaseIntegrationEnabled,
} from "./integration-test";

describe("database integration gating", () => {
  const originalFlag = process.env.RUN_DB_INTEGRATION_TESTS;

  it("is disabled unless RUN_DB_INTEGRATION_TESTS=true", () => {
    delete process.env.RUN_DB_INTEGRATION_TESTS;
    assert.equal(isDatabaseIntegrationEnabled(), false);

    process.env.RUN_DB_INTEGRATION_TESTS = "true";
    assert.equal(isDatabaseIntegrationEnabled(), true);
  });

  it("rejects integration DDL without explicit INTEGRATION_SQL_DDL_ALLOWED", () => {
    const envBackup = {
      RUN_DB_INTEGRATION_TESTS: process.env.RUN_DB_INTEGRATION_TESTS,
      INTEGRATION_SQL_DDL_ALLOWED: process.env.INTEGRATION_SQL_DDL_ALLOWED,
      NODE_ENV: process.env.NODE_ENV,
      DB_NAME: process.env.DB_NAME,
      DB_HOST: process.env.DB_HOST,
    };

    process.env.RUN_DB_INTEGRATION_TESTS = "true";
    process.env.NODE_ENV = "test";
    process.env.DB_NAME = INTEGRATION_DATABASE_NAME;
    process.env.DB_HOST = "localhost";

    delete process.env.INTEGRATION_SQL_DDL_ALLOWED;
    assert.throws(
      () => assertSafeIntegrationDatabaseTarget(),
      /INTEGRATION_SQL_DDL_ALLOWED/,
      "localhost dinamic_attendance without explicit DDL authorization",
    );

    process.env.INTEGRATION_SQL_DDL_ALLOWED = "true";
    assert.doesNotThrow(() => assertSafeIntegrationDatabaseTarget());

    process.env.DB_HOST = "sql.remote.example";
    delete process.env.INTEGRATION_SQL_DDL_ALLOWED;
    assert.throws(
      () => assertSafeIntegrationDatabaseTarget(),
      /INTEGRATION_SQL_DDL_ALLOWED/,
      "remote host still requires explicit authorization",
    );

    process.env.INTEGRATION_SQL_DDL_ALLOWED = "true";
    assert.doesNotThrow(
      () => assertSafeIntegrationDatabaseTarget(),
      "remote host permitted when DDL explicitly authorized and DB_NAME matches",
    );

    process.env.DB_NAME = "production_attendance";
    assert.throws(() => assertSafeIntegrationDatabaseTarget(), /DB_NAME=/);

    process.env.RUN_DB_INTEGRATION_TESTS = envBackup.RUN_DB_INTEGRATION_TESTS;
    process.env.INTEGRATION_SQL_DDL_ALLOWED = envBackup.INTEGRATION_SQL_DDL_ALLOWED;
    process.env.NODE_ENV = envBackup.NODE_ENV;
    process.env.DB_NAME = envBackup.DB_NAME;
    process.env.DB_HOST = envBackup.DB_HOST;
  });

  it("rejects connected SQL when DB_NAME() does not match configured target", async () => {
    const envBackup = {
      RUN_DB_INTEGRATION_TESTS: process.env.RUN_DB_INTEGRATION_TESTS,
      INTEGRATION_SQL_DDL_ALLOWED: process.env.INTEGRATION_SQL_DDL_ALLOWED,
      NODE_ENV: process.env.NODE_ENV,
      DB_NAME: process.env.DB_NAME,
    };

    process.env.RUN_DB_INTEGRATION_TESTS = "true";
    process.env.INTEGRATION_SQL_DDL_ALLOWED = "true";
    process.env.NODE_ENV = "test";
    process.env.DB_NAME = INTEGRATION_DATABASE_NAME;

    const pool = {
      request: () => ({
        query: async (sqlText: string) => {
          if (sqlText.includes("DB_NAME()")) {
            return { recordset: [{ connected_db_name: "other_database" }] };
          }
          return { recordset: [{ found: 1 }] };
        },
      }),
    } as unknown as ConnectionPool;

    await assert.rejects(
      () => assertSafeIntegrationDatabaseConnectedTarget(pool),
      /connected DB_NAME\(\)/,
    );

    const alignedPool = {
      request: () => ({
        query: async (sqlText: string) => {
          if (sqlText.includes("DB_NAME()")) {
            return { recordset: [{ connected_db_name: INTEGRATION_DATABASE_NAME }] };
          }
          return { recordset: [{ found: 1 }] };
        },
      }),
    } as unknown as ConnectionPool;

    await assert.doesNotReject(() => assertSafeIntegrationDatabaseConnectedTarget(alignedPool));

    process.env.RUN_DB_INTEGRATION_TESTS = envBackup.RUN_DB_INTEGRATION_TESTS;
    process.env.INTEGRATION_SQL_DDL_ALLOWED = envBackup.INTEGRATION_SQL_DDL_ALLOWED;
    process.env.NODE_ENV = envBackup.NODE_ENV;
    process.env.DB_NAME = envBackup.DB_NAME;
  });

  it("restores RUN_DB_INTEGRATION_TESTS", () => {
    if (originalFlag === undefined) {
      delete process.env.RUN_DB_INTEGRATION_TESTS;
      return;
    }

    process.env.RUN_DB_INTEGRATION_TESTS = originalFlag;
  });
});
