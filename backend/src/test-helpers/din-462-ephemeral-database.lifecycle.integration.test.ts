import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { describeDatabaseIntegration, setupDatabaseIntegration, teardownDatabaseIntegration } from "./integration-test";
import {
  createEphemeralIntegrationDatabase,
  destroyEphemeralIntegrationDatabaseByName,
} from "./ephemeral-integration-database";
import { assertIntegrationDatabaseNameIsEphemeral } from "./test-sql-server-guard";
import { resolveTestSqlProvisionCredentials } from "./test-sql-credentials";
import { getAppliedMigrations, runMigrationsOnPool } from "../database/run-migrations";

describeDatabaseIntegration("DIN-462 ephemeral integration lifecycle", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("creates migrated ephemeral database with system_migrations", async () => {
    const credentials = resolveTestSqlProvisionCredentials();
    const nested = await createEphemeralIntegrationDatabase(credentials);
    await runMigrationsOnPool(nested.pool);
    try {
      const applied = await getAppliedMigrations(nested.pool);
      assert.ok(applied.size > 50, `expected many migrations, got ${applied.size}`);
      const company = await nested.pool.request().query(`
        SELECT TOP 1 id FROM companies WHERE name = N'Dinamic Systems'
      `);
      assert.ok(company.recordset[0], "Dinamic Systems from migration 015");
    } finally {
      await destroyEphemeralIntegrationDatabaseByName(credentials, nested.evidence.databaseName, {
        ownershipToken: nested.evidence.ownershipToken,
        orchestratorPid: nested.evidence.orchestratorPid,
        allowForeignSessions: true,
      });
    }
  });

  it("rejects writes against protected database name", () => {
    assert.throws(() => assertIntegrationDatabaseNameIsEphemeral("dinamic_attendance"), /protected/);
  });

  it("supports concurrent ephemeral databases with distinct names", async () => {
    const credentials = resolveTestSqlProvisionCredentials();
    const [a, b] = await Promise.all([
      createEphemeralIntegrationDatabase(credentials),
      createEphemeralIntegrationDatabase(credentials),
    ]);
    assert.notEqual(a.evidence.databaseName, b.evidence.databaseName);
    try {
      assert.ok(a.pool.connected);
      assert.ok(b.pool.connected);
    } finally {
      await destroyEphemeralIntegrationDatabaseByName(credentials, a.evidence.databaseName, {
        ownershipToken: a.evidence.ownershipToken,
        allowForeignSessions: true,
      });
      await destroyEphemeralIntegrationDatabaseByName(credentials, b.evidence.databaseName, {
        ownershipToken: b.evidence.ownershipToken,
        allowForeignSessions: true,
      });
    }
  });

  it("cleans up when ownership stamp fails before completion", async () => {
    const credentials = resolveTestSqlProvisionCredentials();
    const databaseName = `din_test_${crypto.randomUUID()}`;
    await assert.rejects(
      () =>
        createEphemeralIntegrationDatabase(credentials, {
          databaseName,
          injectStampOwnershipFailure: true,
        }),
      /INJECTED_STAMP_OWNERSHIP_FAILURE/,
    );

    const master = new sql.ConnectionPool({
      server: credentials.host,
      port: credentials.port,
      database: "master",
      user: credentials.user,
      password: credentials.password,
      options: {
        encrypt: credentials.encrypt,
        trustServerCertificate: credentials.trustServerCertificate,
      },
    });
    await master.connect();
    const exists = await master
      .request()
      .input("dbName", sql.NVarChar(128), databaseName)
      .query(`SELECT DB_ID(@dbName) AS db_id`);
    assert.equal(exists.recordset[0]?.db_id, null);
    await master.close();
  });

  it("cleans up after bootstrap failure injection", async () => {
    const credentials = resolveTestSqlProvisionCredentials();
    const databaseName = `din_test_${crypto.randomUUID()}`;
    await assert.rejects(
      () =>
        createEphemeralIntegrationDatabase(credentials, {
          databaseName,
          injectCreateFailure: true,
        }),
      /INJECTED_CREATE_FAILURE/,
    );

    const master = new sql.ConnectionPool({
      server: credentials.host,
      port: credentials.port,
      database: "master",
      user: credentials.user,
      password: credentials.password,
      options: {
        encrypt: credentials.encrypt,
        trustServerCertificate: credentials.trustServerCertificate,
      },
    });
    await master.connect();
    const exists = await master
      .request()
      .input("dbName", sql.NVarChar(128), databaseName)
      .query(`SELECT DB_ID(@dbName) AS db_id`);
    assert.equal(exists.recordset[0]?.db_id, null);
    await master.close();
  });
});