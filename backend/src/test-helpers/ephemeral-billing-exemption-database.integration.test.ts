/**
 * Ephemeral billing database lifecycle guards.
 * Enable: RUN_DB_INTEGRATION_TESTS=true, INTEGRATION_SQL_DDL_ALLOWED=true,
 *         INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED=true
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sql from "mssql";
import { env } from "../config/env";
import { isDatabaseIntegrationEnabled } from "./integration-test";
import {
  EPHEMERAL_DB_PREFIX,
  createEphemeralBillingExemptionDatabase,
} from "./ephemeral-billing-exemption-database";

const describeGuard = isDatabaseIntegrationEnabled() ? describe : describe.skip;

const sqlConfigMaster = (): sql.config => ({
  server: env.DB_HOST,
  port: env.DB_PORT,
  database: "master",
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
  },
});

const listEphemeralBillingDatabases = async (
  master: sql.ConnectionPool,
): Promise<Set<string>> => {
  const result = await master.request().input("prefix", sql.NVarChar(128), `${EPHEMERAL_DB_PREFIX}%`).query(`
    SELECT name
    FROM sys.databases
    WHERE name LIKE @prefix
  `);
  return new Set(result.recordset.map((row) => String(row.name)));
};

describeGuard("ephemeral billing exemption database lifecycle", () => {
  it("drops the ephemeral database when bootstrap fails after CREATE DATABASE", async (testContext) => {
    if (process.env.INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED !== "true") {
      testContext.skip("INTEGRATION_EPHEMERAL_BILLING_DDL_ALLOWED is not true");
    }

    const master = new sql.ConnectionPool(sqlConfigMaster());
    await master.connect();
    try {
      const before = await listEphemeralBillingDatabases(master);

      await assert.rejects(
        () =>
          createEphemeralBillingExemptionDatabase({
            injectBootstrapFailure: true,
          }),
        /EPHEMERAL_BOOTSTRAP_INJECTED_FAILURE/,
      );

      const after = await listEphemeralBillingDatabases(master);
      const added = [...after].filter((name) => !before.has(name));
      assert.deepEqual(
        added,
        [],
        `bootstrap failure must not leave new billing databases; found: ${added.join(", ")}`,
      );
    } finally {
      await master.close();
    }
  });
});