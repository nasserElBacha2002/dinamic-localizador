/**
 * Phases 3 & 4 — security roles foundation + optional privilege denial checks.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 * Optional denial suite: RUN_DB_PRIVILEGE_TESTS=true + DB_PRIVILEGE_TEST_USER/PASSWORD
 *   (SQL login mapped to dinamic_app_runtime, not sa/db_owner)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "./connection";
import { applySqlScriptInTransaction } from "./run-migrations";

const migrationsDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const privilegeTestsEnabled =
  process.env.RUN_DB_PRIVILEGE_TESTS === "true" &&
  Boolean(process.env.DB_PRIVILEGE_TEST_USER) &&
  Boolean(process.env.DB_PRIVILEGE_TEST_PASSWORD);

const roleExists = async (roleName: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("name", sql.NVarChar(256), roleName)
    .query(`
      SELECT 1 AS found
      FROM sys.database_principals
      WHERE name = @name AND type = 'R'
    `);
  return Boolean(result.recordset[0]);
};

const schemaPermissionGranted = async (
  roleName: string,
  permissionName: string,
): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("roleName", sql.NVarChar(256), roleName)
    .input("permissionName", sql.NVarChar(128), permissionName)
    .query(`
      SELECT 1 AS found
      FROM sys.database_permissions p
      INNER JOIN sys.database_principals r ON r.principal_id = p.grantee_principal_id
      INNER JOIN sys.schemas s ON s.schema_id = p.major_id AND p.class_desc = 'SCHEMA'
      WHERE r.name = @roleName
        AND s.name = N'dbo'
        AND p.permission_name = @permissionName
        AND p.state_desc = 'GRANT'
    `);
  return Boolean(result.recordset[0]);
};

describeDatabaseIntegration("phase3-4 db security roles", () => {
  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
    const script = readFileSync(
      join(migrationsDir, "089_phase3_4_db_security_roles.sql"),
      "utf8",
    );
    await applySqlScriptInTransaction(getPool(), script);
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("creates dinamic_app_runtime and dinamic_app_migrations roles", async () => {
    assert.equal(await roleExists("dinamic_app_runtime"), true);
    assert.equal(await roleExists("dinamic_app_migrations"), true);
  });

  it("grants runtime DML on SCHEMA::dbo", async () => {
    for (const permission of ["SELECT", "INSERT", "UPDATE", "DELETE", "EXECUTE"]) {
      assert.equal(
        await schemaPermissionGranted("dinamic_app_runtime", permission),
        true,
        `expected runtime GRANT ${permission} ON SCHEMA::dbo`,
      );
    }
  });

  it("grants migrations ALTER and DML on SCHEMA::dbo", async () => {
    for (const permission of ["ALTER", "SELECT", "INSERT", "UPDATE", "DELETE", "EXECUTE"]) {
      assert.equal(
        await schemaPermissionGranted("dinamic_app_migrations", permission),
        true,
        `expected migrations GRANT ${permission} ON SCHEMA::dbo`,
      );
    }
  });

  it("documents dangerous SQL Server features without mutating configuration", async () => {
    const configs = await getPool().request().query(`
      SELECT name, CAST(value_in_use AS INT) AS value_in_use
      FROM sys.configurations
      WHERE name IN (
        N'xp_cmdshell',
        N'Ole Automation Procedures',
        N'clr enabled',
        N'Ad Hoc Distributed Queries'
      )
      ORDER BY name
    `);
    const trustworthy = await getPool().request().query(`
      SELECT is_trustworthy_on
      FROM sys.databases
      WHERE name = DB_NAME()
    `);

    assert.ok(configs.recordset.length >= 1);
    assert.equal(typeof trustworthy.recordset[0]?.is_trustworthy_on, "boolean");

    // Evidence-only: we do not flip instance flags in shared/dev SQL.
    for (const row of configs.recordset) {
      assert.ok(typeof row.name === "string");
      assert.ok(typeof row.value_in_use === "number");
    }
  });

  it(
    "runtime privilege test user cannot ALTER/DROP tables",
    { skip: !privilegeTestsEnabled },
    async () => {
      const user = process.env.DB_PRIVILEGE_TEST_USER!;
      const password = process.env.DB_PRIVILEGE_TEST_PASSWORD!;
      const { env } = await import("../config/env");

      const pool = await sql.connect({
        server: env.DB_HOST,
        port: env.DB_PORT,
        database: env.DB_NAME,
        user,
        password,
        options: {
          encrypt: env.DB_ENCRYPT,
          trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
        },
      });

      try {
        await assert.rejects(
          () =>
            pool.request().query(`
              ALTER TABLE dbo.companies ADD phase34_priv_probe INT NULL;
            `),
          (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            return /permission|denied|authorize/i.test(message);
          },
        );

        await assert.rejects(
          () => pool.request().query(`DROP TABLE dbo.companies;`),
          (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            return /permission|denied|authorize/i.test(message);
          },
        );

        // Representative business read must still succeed.
        const read = await pool.request().query(`SELECT TOP (1) id FROM dbo.companies`);
        assert.ok(Array.isArray(read.recordset));
      } finally {
        await pool.close();
      }
    },
  );
});
