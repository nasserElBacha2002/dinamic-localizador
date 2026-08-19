/**
 * Disposable-DB apply / rollback / reapply of 097 then 098.
 * Does not touch the shared dinamic_attendance database.
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
import { env } from "../config/env";
import { applySqlScriptInTransaction } from "../database/run-migrations";

const migrationsDir = join(process.cwd(), "..", "database", "migrations");

const sqlConfig = (database: string): sql.config => ({
  server: env.DB_HOST,
  port: env.DB_PORT,
  database,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
  },
});

async function columnNames(pool: sql.ConnectionPool, table: string): Promise<Set<string>> {
  const result = await pool
    .request()
    .input("table", table)
    .query(`
      SELECT name
      FROM sys.columns
      WHERE object_id = OBJECT_ID(@table)
    `);
  return new Set(result.recordset.map((row) => String(row.name)));
}

async function tableExists(pool: sql.ConnectionPool, name: string): Promise<boolean> {
  const result = await pool
    .request()
    .input("name", name)
    .query(`SELECT OBJECT_ID(@name) AS object_id`);
  return Boolean(result.recordset[0]?.object_id);
}

async function indexExists(pool: sql.ConnectionPool, table: string, indexName: string): Promise<boolean> {
  const result = await pool
    .request()
    .input("table", table)
    .input("indexName", indexName)
    .query(`
      SELECT 1 AS found
      FROM sys.indexes
      WHERE object_id = OBJECT_ID(@table)
        AND name = @indexName
    `);
  return Boolean(result.recordset[0]);
}

async function fkExists(pool: sql.ConnectionPool, name: string): Promise<boolean> {
  const result = await pool
    .request()
    .input("name", name)
    .query(`
      SELECT 1 AS found
      FROM sys.foreign_keys
      WHERE name = @name
    `);
  return Boolean(result.recordset[0]);
}

async function defaultExists(pool: sql.ConnectionPool, name: string): Promise<boolean> {
  const result = await pool
    .request()
    .input("name", name)
    .query(`
      SELECT 1 AS found
      FROM sys.default_constraints
      WHERE name = @name
    `);
  return Boolean(result.recordset[0]);
}

async function assert098Present(pool: sql.ConnectionPool): Promise<void> {
  const users = await columnNames(pool, "dbo.users");
  assert.equal(users.has("two_factor_enabled"), true);
  assert.equal(users.has("two_factor_secret_encrypted"), true);
  assert.equal(users.has("two_factor_confirmed_at"), true);
  assert.equal(users.has("two_factor_last_used_step"), true);
  assert.equal(await tableExists(pool, "dbo.user_two_factor_recovery_codes"), true);
  assert.equal(await tableExists(pool, "dbo.user_two_factor_login_challenges"), true);
  assert.equal(await fkExists(pool, "FK_user_two_factor_recovery_codes_user"), true);
  assert.equal(await fkExists(pool, "FK_user_two_factor_login_challenges_user"), true);
  assert.equal(await indexExists(pool, "dbo.user_two_factor_recovery_codes", "UQ_user_two_factor_recovery_codes_hash"), true);
  assert.equal(await indexExists(pool, "dbo.user_two_factor_recovery_codes", "IX_user_two_factor_recovery_codes_user_id"), true);
  assert.equal(await indexExists(pool, "dbo.user_two_factor_login_challenges", "UQ_user_two_factor_login_challenges_hash"), true);
  assert.equal(await indexExists(pool, "dbo.user_two_factor_login_challenges", "IX_user_two_factor_login_challenges_user_id"), true);
  assert.equal(await defaultExists(pool, "DF_users_two_factor_enabled"), true);
}

async function assert098Absent(pool: sql.ConnectionPool): Promise<void> {
  const users = await columnNames(pool, "dbo.users");
  assert.equal(users.has("two_factor_enabled"), false);
  assert.equal(users.has("two_factor_secret_encrypted"), false);
  assert.equal(users.has("two_factor_confirmed_at"), false);
  assert.equal(users.has("two_factor_last_used_step"), false);
  assert.equal(users.has("token_version"), true);
  assert.equal(await tableExists(pool, "dbo.user_two_factor_recovery_codes"), false);
  assert.equal(await tableExists(pool, "dbo.user_two_factor_login_challenges"), false);
  assert.equal(await tableExists(pool, "dbo.user_password_reset_tokens"), true);
}

describeDatabaseIntegration("migration 098 disposable apply/rollback/reapply", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("applies 097+098, rolls 098 back, and reapplies 098 on a throwaway database", async () => {
    const dbName = `d2fa_mig_${Date.now()}`;
    assert.match(dbName, /^d2fa_mig_\d+$/);

    const master = new sql.ConnectionPool(sqlConfig("master"));
    await master.connect();
    let disposable: sql.ConnectionPool | null = null;
    try {
      await master.request().query(`CREATE DATABASE [${dbName}]`);
      disposable = new sql.ConnectionPool(sqlConfig(dbName));
      await disposable.connect();

      await disposable.request().query(`
        CREATE TABLE dbo.users (
          id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT PK_users_d2fa_mig PRIMARY KEY DEFAULT NEWID(),
          name NVARCHAR(150) NOT NULL,
          email NVARCHAR(255) NOT NULL,
          password_hash NVARCHAR(255) NOT NULL,
          role NVARCHAR(30) NOT NULL,
          active BIT NOT NULL CONSTRAINT DF_users_active_d2fa_mig DEFAULT (1),
          last_login_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      `);

      const script097 = readFileSync(join(migrationsDir, "097_users_token_version_password_reset.sql"), "utf8");
      const script098 = readFileSync(join(migrationsDir, "098_users_two_factor_totp.sql"), "utf8");
      const rollback098 = readFileSync(
        join(migrationsDir, "rollback", "098_users_two_factor_totp_rollback.sql"),
        "utf8",
      );

      await applySqlScriptInTransaction(disposable, script097);
      await applySqlScriptInTransaction(disposable, script098);
      await assert098Present(disposable);

      await applySqlScriptInTransaction(disposable, rollback098);
      await assert098Absent(disposable);

      await applySqlScriptInTransaction(disposable, script098);
      await assert098Present(disposable);
    } finally {
      if (disposable) {
        await disposable.close();
      }
      try {
        await master.request().query(`
          IF DB_ID(N'${dbName}') IS NOT NULL
          BEGIN
            ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            DROP DATABASE [${dbName}];
          END
        `);
      } finally {
        await master.close();
      }
    }
  });
});
