/**
 * Phases 3 & 4 corrections — role semantics via CREATE USER WITHOUT LOGIN + EXECUTE AS.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 * Optional real-login smoke: RUN_DB_PRIVILEGE_TESTS=true + DB_PRIVILEGE_TEST_USER/PASSWORD
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

const RUNTIME_TEST_USER = "phase34_runtime_test";
const MIGRATION_TEST_USER = "phase34_migration_test";
const PROBE_TABLE = "phase34_perm_probe";
const MIG_PROBE_TABLE = "phase34_mig_probe";
const ADMIN_PROBE_PROC = "phase34_admin_probe";
const FAKE_MIGRATION_NAME = "__phase34_probe_not_a_real_migration__";

const privilegeTestsEnabled =
  process.env.RUN_DB_PRIVILEGE_TESTS === "true" &&
  Boolean(process.env.DB_PRIVILEGE_TEST_USER) &&
  Boolean(process.env.DB_PRIVILEGE_TEST_PASSWORD);

const readMigration = (name: string): string =>
  readFileSync(join(migrationsDir, name), "utf8");

const readRollback = (name: string): string =>
  readFileSync(join(migrationsDir, "rollback", name), "utf8");

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

const userExists = async (userName: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("name", sql.NVarChar(256), userName)
    .query(`
      SELECT 1 AS found
      FROM sys.database_principals
      WHERE name = @name AND type IN ('S', 'U')
    `);
  return Boolean(result.recordset[0]);
};

const tableExists = async (tableName: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("name", sql.NVarChar(256), `dbo.${tableName}`)
    .query(`SELECT CASE WHEN OBJECT_ID(@name, 'U') IS NULL THEN 0 ELSE 1 END AS found`);
  return Boolean(result.recordset[0]?.found);
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

const objectExecuteGranted = async (roleName: string, objectName: string): Promise<boolean> => {
  const result = await getPool()
    .request()
    .input("roleName", sql.NVarChar(256), roleName)
    .input("objectName", sql.NVarChar(256), objectName)
    .query(`
      SELECT 1 AS found
      FROM sys.database_permissions p
      INNER JOIN sys.database_principals r ON r.principal_id = p.grantee_principal_id
      INNER JOIN sys.objects o ON o.object_id = p.major_id AND p.class_desc = 'OBJECT_OR_COLUMN'
      WHERE r.name = @roleName
        AND o.name = @objectName
        AND p.permission_name = N'EXECUTE'
        AND p.state_desc = 'GRANT'
    `);
  return Boolean(result.recordset[0]);
};

const dropUserIfExists = async (userName: string): Promise<void> => {
  if (!(await userExists(userName))) {
    return;
  }
  await getPool()
    .request()
    .input("userName", sql.NVarChar(256), userName)
    .query(`
      DECLARE @sql NVARCHAR(500) = N'DROP USER ' + QUOTENAME(@userName);
      EXEC sys.sp_executesql @sql;
    `);
};

const dropRoleMemberIfPresent = async (roleName: string, memberName: string): Promise<void> => {
  await getPool()
    .request()
    .input("roleName", sql.NVarChar(256), roleName)
    .input("memberName", sql.NVarChar(256), memberName)
    .query(`
      IF EXISTS (
        SELECT 1
        FROM sys.database_role_members rm
        INNER JOIN sys.database_principals r ON r.principal_id = rm.role_principal_id
        INNER JOIN sys.database_principals m ON m.principal_id = rm.member_principal_id
        WHERE r.name = @roleName AND m.name = @memberName
      )
      BEGIN
        DECLARE @sql NVARCHAR(500) =
          N'ALTER ROLE ' + QUOTENAME(@roleName) + N' DROP MEMBER ' + QUOTENAME(@memberName);
        EXEC sys.sp_executesql @sql;
      END
    `);
};

const cleanupFixtures = async (): Promise<void> => {
  const pool = getPool();
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.${ADMIN_PROBE_PROC}', N'P') IS NOT NULL
      DROP PROCEDURE dbo.${ADMIN_PROBE_PROC};
    IF OBJECT_ID(N'dbo.${PROBE_TABLE}', N'U') IS NOT NULL
      DROP TABLE dbo.${PROBE_TABLE};
    IF OBJECT_ID(N'dbo.${MIG_PROBE_TABLE}', N'U') IS NOT NULL
      DROP TABLE dbo.${MIG_PROBE_TABLE};
    DELETE FROM dbo.system_migrations WHERE migration_name = N'${FAKE_MIGRATION_NAME}';
  `);
  await dropRoleMemberIfPresent("dinamic_app_runtime", RUNTIME_TEST_USER);
  await dropRoleMemberIfPresent("dinamic_app_migrations", MIGRATION_TEST_USER);
  await dropUserIfExists(RUNTIME_TEST_USER);
  await dropUserIfExists(MIGRATION_TEST_USER);
};

const resetRolesViaRollbackAnd089 = async (): Promise<void> => {
  await cleanupFixtures();
  if ((await roleExists("dinamic_app_runtime")) || (await roleExists("dinamic_app_migrations"))) {
    await applySqlScriptInTransaction(
      getPool(),
      readRollback("089_phase3_4_db_security_roles_rollback.sql"),
    );
  }
  assert.equal(await roleExists("dinamic_app_runtime"), false);
  assert.equal(await roleExists("dinamic_app_migrations"), false);
  await applySqlScriptInTransaction(getPool(), readMigration("089_phase3_4_db_security_roles.sql"));
  await applySqlScriptInTransaction(
    getPool(),
    readMigration("090_phase3_4_revoke_schema_execute.sql"),
  );
};

const isPermissionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /permission|denied|not authorized|do not have|cannot|failed/i.test(message);
};

describeDatabaseIntegration("phase3-4 db security roles (corrections)", () => {
  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
    await resetRolesViaRollbackAnd089();
  });

  after(async () => {
    try {
      await cleanupFixtures();
      // Leave roles in place when they match 089 so the official migration runner
      // can register 089 as a no-op heal instead of orphaning roles without system_migrations.
    } catch (error) {
      console.warn("[phase3-4-security] fixture cleanup failed", error);
    }
    await teardownDatabaseIntegration();
  });

  it("creates roles without schema-level EXECUTE for runtime", async () => {
    assert.equal(await roleExists("dinamic_app_runtime"), true);
    assert.equal(await roleExists("dinamic_app_migrations"), true);
    for (const permission of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.equal(await schemaPermissionGranted("dinamic_app_runtime", permission), true);
    }
    assert.equal(await schemaPermissionGranted("dinamic_app_runtime", "EXECUTE"), false);
    assert.equal(await schemaPermissionGranted("dinamic_app_migrations", "EXECUTE"), false);
  });

  it("grants migrations ALTER/DML and object EXECUTE only on known UDF", async () => {
    for (const permission of ["ALTER", "SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.equal(await schemaPermissionGranted("dinamic_app_migrations", permission), true);
    }
    const fnExists = await getPool().request().query(`
      SELECT CASE WHEN OBJECT_ID(N'dbo.fn_resolve_operation_timezone_for_sql', N'FN') IS NULL
        THEN 0 ELSE 1 END AS found
    `);
    if (fnExists.recordset[0]?.found) {
      assert.equal(
        await objectExecuteGranted(
          "dinamic_app_migrations",
          "fn_resolve_operation_timezone_for_sql",
        ),
        true,
      );
    }
  });

  it("runtime effective permissions: DML ok, DDL denied, future proc denied", async () => {
    const pool = getPool();
    await cleanupFixtures();

    await pool.request().query(`
      CREATE USER ${RUNTIME_TEST_USER} WITHOUT LOGIN;
      ALTER ROLE dinamic_app_runtime ADD MEMBER ${RUNTIME_TEST_USER};

      CREATE TABLE dbo.${PROBE_TABLE} (
        id INT NOT NULL PRIMARY KEY,
        note NVARCHAR(50) NULL
      );
    `);

    // Positive DML
    await pool.request().query(`
      EXECUTE AS USER = N'${RUNTIME_TEST_USER}';
      INSERT INTO dbo.${PROBE_TABLE} (id, note) VALUES (1, N'a');
      UPDATE dbo.${PROBE_TABLE} SET note = N'b' WHERE id = 1;
      SELECT note FROM dbo.${PROBE_TABLE} WHERE id = 1;
      DELETE FROM dbo.${PROBE_TABLE} WHERE id = 1;
      REVERT;
    `);

    const empty = await pool.request().query(`SELECT COUNT(*) AS c FROM dbo.${PROBE_TABLE}`);
    assert.equal(Number(empty.recordset[0].c), 0);

    // DDL denials — metadata must not change
    await assert.rejects(
      () =>
        pool.request().query(`
          EXECUTE AS USER = N'${RUNTIME_TEST_USER}';
          BEGIN TRY
            CREATE TABLE dbo.phase34_runtime_should_not_exist (id INT NOT NULL);
            REVERT;
          END TRY
          BEGIN CATCH
            REVERT;
            THROW;
          END CATCH
        `),
      isPermissionError,
    );
    assert.equal(await tableExists("phase34_runtime_should_not_exist"), false);

    const companiesColBefore = await pool.request().query(`
      SELECT COUNT(*) AS c
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.companies') AND name = N'phase34_priv_probe'
    `);
    await assert.rejects(
      () =>
        pool.request().query(`
          EXECUTE AS USER = N'${RUNTIME_TEST_USER}';
          BEGIN TRY
            ALTER TABLE dbo.companies ADD phase34_priv_probe INT NULL;
            REVERT;
          END TRY
          BEGIN CATCH
            REVERT;
            THROW;
          END CATCH
        `),
      isPermissionError,
    );
    const companiesColAfter = await pool.request().query(`
      SELECT COUNT(*) AS c
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.companies') AND name = N'phase34_priv_probe'
    `);
    assert.equal(Number(companiesColBefore.recordset[0].c), 0);
    assert.equal(Number(companiesColAfter.recordset[0].c), 0);

    await assert.rejects(
      () =>
        pool.request().query(`
          EXECUTE AS USER = N'${RUNTIME_TEST_USER}';
          BEGIN TRY
            DROP TABLE dbo.${PROBE_TABLE};
            REVERT;
          END TRY
          BEGIN CATCH
            REVERT;
            THROW;
          END CATCH
        `),
      isPermissionError,
    );
    assert.equal(await tableExists(PROBE_TABLE), true);

    // Future / arbitrary procedure isolation
    await pool.request().query(`
      CREATE PROCEDURE dbo.${ADMIN_PROBE_PROC}
      AS
      BEGIN
        SET NOCOUNT ON;
        SELECT 1 AS ok;
      END;
    `);

    await assert.rejects(
      () =>
        pool.request().query(`
          EXECUTE AS USER = N'${RUNTIME_TEST_USER}';
          BEGIN TRY
            EXEC dbo.${ADMIN_PROBE_PROC};
            REVERT;
          END TRY
          BEGIN CATCH
            REVERT;
            THROW;
          END CATCH
        `),
      isPermissionError,
    );

    await cleanupFixtures();
  });

  it("migration effective permissions: DDL, backfill DML, system_migrations access", async () => {
    const pool = getPool();
    await cleanupFixtures();

    await pool.request().query(`
      CREATE USER ${MIGRATION_TEST_USER} WITHOUT LOGIN;
      ALTER ROLE dinamic_app_migrations ADD MEMBER ${MIGRATION_TEST_USER};
    `);

    await pool.request().query(`
      EXECUTE AS USER = N'${MIGRATION_TEST_USER}';
      BEGIN TRY
        CREATE TABLE dbo.${MIG_PROBE_TABLE} (
          id INT NOT NULL PRIMARY KEY,
          note NVARCHAR(50) NULL
        );
        ALTER TABLE dbo.${MIG_PROBE_TABLE} ADD extra_col INT NULL;
        CREATE INDEX IX_phase34_mig_probe_note ON dbo.${MIG_PROBE_TABLE}(note);
        INSERT INTO dbo.${MIG_PROBE_TABLE} (id, note, extra_col) VALUES (1, N'backfill', 0);
        UPDATE dbo.${MIG_PROBE_TABLE} SET extra_col = 1 WHERE id = 1;
        INSERT INTO dbo.system_migrations (migration_name)
        VALUES (N'${FAKE_MIGRATION_NAME}');
        SELECT migration_name FROM dbo.system_migrations WHERE migration_name = N'${FAKE_MIGRATION_NAME}';
        DELETE FROM dbo.system_migrations WHERE migration_name = N'${FAKE_MIGRATION_NAME}';
        DROP TABLE dbo.${MIG_PROBE_TABLE};
        REVERT;
      END TRY
      BEGIN CATCH
        REVERT;
        THROW;
      END CATCH
    `);

    assert.equal(await tableExists(MIG_PROBE_TABLE), false);
    const leftover = await pool
      .request()
      .input("name", sql.NVarChar(256), FAKE_MIGRATION_NAME)
      .query(`SELECT COUNT(*) AS c FROM dbo.system_migrations WHERE migration_name = @name`);
    assert.equal(Number(leftover.recordset[0].c), 0);

    await cleanupFixtures();
  });

  it("089 forward → rollback → forward restores roles and clears members", async () => {
    const pool = getPool();
    await cleanupFixtures();
    assert.equal(await roleExists("dinamic_app_runtime"), true);

    await pool.request().query(`
      CREATE USER ${RUNTIME_TEST_USER} WITHOUT LOGIN;
      ALTER ROLE dinamic_app_runtime ADD MEMBER ${RUNTIME_TEST_USER};
    `);

    await applySqlScriptInTransaction(
      pool,
      readRollback("089_phase3_4_db_security_roles_rollback.sql"),
    );
    assert.equal(await roleExists("dinamic_app_runtime"), false);
    assert.equal(await roleExists("dinamic_app_migrations"), false);
    // WITHOUT LOGIN users may remain after role drop; remove if present
    await dropUserIfExists(RUNTIME_TEST_USER);

    await applySqlScriptInTransaction(pool, readMigration("089_phase3_4_db_security_roles.sql"));
    await applySqlScriptInTransaction(
      pool,
      readMigration("090_phase3_4_revoke_schema_execute.sql"),
    );
    assert.equal(await roleExists("dinamic_app_runtime"), true);
    assert.equal(await roleExists("dinamic_app_migrations"), true);
    assert.equal(await schemaPermissionGranted("dinamic_app_runtime", "EXECUTE"), false);
  });

  it("089 refuses preexisting roles (schema drift) without partial grants", async () => {
    const pool = getPool();
    await cleanupFixtures();
    await applySqlScriptInTransaction(
      pool,
      readRollback("089_phase3_4_db_security_roles_rollback.sql"),
    );

    await pool.request().query(`CREATE ROLE dinamic_app_runtime AUTHORIZATION dbo;`);

    await assert.rejects(
      () => applySqlScriptInTransaction(pool, readMigration("089_phase3_4_db_security_roles.sql")),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return /SCHEMA_DRIFT|50089|already exists/i.test(message);
      },
    );

    assert.equal(await roleExists("dinamic_app_runtime"), true);
    assert.equal(await roleExists("dinamic_app_migrations"), false);
    assert.equal(await schemaPermissionGranted("dinamic_app_runtime", "SELECT"), false);

    await pool.request().query(`DROP ROLE dinamic_app_runtime;`);
    await applySqlScriptInTransaction(pool, readMigration("089_phase3_4_db_security_roles.sql"));
    await applySqlScriptInTransaction(
      pool,
      readMigration("090_phase3_4_revoke_schema_execute.sql"),
    );
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
    assert.ok(configs.recordset.length >= 1);
  });

  it(
    "optional real-login smoke (ops cutover)",
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
          () => pool.request().query(`ALTER TABLE dbo.companies ADD phase34_login_probe INT NULL;`),
          isPermissionError,
        );
        const read = await pool.request().query(`SELECT TOP (1) id FROM dbo.companies`);
        assert.ok(Array.isArray(read.recordset));
      } finally {
        await pool.close();
      }
    },
  );
});
