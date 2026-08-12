/**
 * Phase 3 corrections — prove migration runner applies 001→093 on a fresh database.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 *
 * Creates `dinamic_attendance_phase3_clean_mig`, runs official runner, asserts 089–093,
 * then drops the database. Requires CREATE DATABASE permission on the SQL login.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { env } from "../config/env";
import { getPool } from "../database/connection";

const CLEAN_DB = "dinamic_attendance_phase3_clean_mig";

const masterConfig = (): sql.config => ({
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

describeDatabaseIntegration("phase3 clean-db migration runner", () => {
  let canCreateDb = false;

  before(async () => {
    await setupDatabaseIntegration();
    const master = await sql.connect(masterConfig());
    try {
      await master.request().query(`
        IF DB_ID(N'${CLEAN_DB}') IS NOT NULL
        BEGIN
          ALTER DATABASE [${CLEAN_DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
          DROP DATABASE [${CLEAN_DB}];
        END
      `);
      await master.request().query(`CREATE DATABASE [${CLEAN_DB}];`);
      canCreateDb = true;
    } catch (error) {
      console.warn(
        "[phase3-clean-mig] CREATE DATABASE not permitted; skipping clean-db runner proof",
        error instanceof Error ? error.message : error,
      );
      canCreateDb = false;
    } finally {
      await master.close();
    }
  });

  after(async () => {
    if (canCreateDb) {
      const master = await sql.connect(masterConfig());
      try {
        await master.request().query(`
          IF DB_ID(N'${CLEAN_DB}') IS NOT NULL
          BEGIN
            ALTER DATABASE [${CLEAN_DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            DROP DATABASE [${CLEAN_DB}];
          END
        `);
      } finally {
        await master.close();
      }
    }
    await teardownDatabaseIntegration();
  });

  it("official runner applies through 093 on empty database", async () => {
    if (!canCreateDb) {
      return;
    }

    const result = spawnSync(
      "npx",
      ["tsx", "src/database/run-migrations.ts"],
      {
        cwd: join(process.cwd()),
        env: {
          ...process.env,
          DB_NAME: CLEAN_DB,
          EMAIL_TRANSPORT: "console",
        },
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Migration applied: 089_phase3_4_db_security_roles\.sql/);
    assert.match(result.stdout, /Migration applied: 091_operation_assignment_whatsapp_notifications\.sql/);
    assert.match(result.stdout, /Migration applied: 092_phase3_scheduled_operations_active_unique\.sql/);
    assert.match(result.stdout, /Migration applied: 093_phase3_scheduled_operations_active_unique_onetime\.sql/);
    assert.match(result.stdout, /Migrations completed/);

    const cleanPool = await sql.connect({
      ...masterConfig(),
      database: CLEAN_DB,
    });
    try {
      const applied = await cleanPool.request().query(`
        SELECT COUNT(*) AS c
        FROM system_migrations
        WHERE migration_name IN (
          N'089_phase3_4_db_security_roles.sql',
          N'090_phase3_4_revoke_schema_execute.sql',
          N'091_operation_assignment_whatsapp_notifications.sql',
          N'092_phase3_scheduled_operations_active_unique.sql',
          N'093_phase3_scheduled_operations_active_unique_onetime.sql'
        )
      `);
      assert.equal(Number(applied.recordset[0].c), 5);

      const filter = await cleanPool.request().query(`
        SELECT filter_definition
        FROM sys.indexes
        WHERE name = N'UQ_scheduled_operations_active_service_start'
      `);
      assert.match(String(filter.recordset[0].filter_definition), /ONE_TIME/);
    } finally {
      await cleanPool.close();
    }

    // Primary pool still points at the original DB.
    assert.ok(getPool());
  });
});
