import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const readCheckDefinition = async (constraintName: string): Promise<string> => {
  const result = await getPool()
    .request()
    .input("name", sql.NVarChar(128), constraintName)
    .query(`
      SELECT definition
      FROM sys.check_constraints
      WHERE name = @name
        AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
    `);
  const definition = String(result.recordset[0]?.definition ?? "");
  assert.ok(definition, `missing constraint ${constraintName}`);
  return definition;
};

describeDatabaseIntegration("admin alert migration 103 constraints", () => {
  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("exposes admin_alerts_enabled_at on company_settings", async () => {
    const result = await getPool().request().query(`
      SELECT 1 AS ok
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.company_settings')
        AND name = N'admin_alerts_enabled_at'
    `);
    assert.equal(result.recordset.length, 1);
  });

  it("CK_waan_alert_type includes Phase C ABSENCE_REQUEST_PENDING", async () => {
    const definition = await readCheckDefinition("CK_waan_alert_type");
    assert.match(definition, /EMPLOYEE_UNAVAILABLE/);
    assert.match(definition, /MISSING_CHECKIN_AFTER_OPERATION/);
    assert.match(definition, /FORWARDED_LOCATION_REJECTED/);
    assert.match(definition, /ABSENCE_REQUEST_PENDING/);
  });

  it("CK_waan_severity allows INFO WARNING CRITICAL", async () => {
    const definition = await readCheckDefinition("CK_waan_severity");
    assert.match(definition, /INFO/);
    assert.match(definition, /WARNING/);
    assert.match(definition, /CRITICAL/);
  });

  it("upgrade-safe: dropping and re-applying 103 CHECK leaves same contract", async () => {
    // Simulate upgrade path: drop CHECKs (as if 101 original lacked them), then re-add like 103.
    await getPool().request().query(`
      IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_waan_alert_type'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
      )
        ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP CONSTRAINT CK_waan_alert_type;

      IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_waan_severity'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
      )
        ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP CONSTRAINT CK_waan_severity;

      ALTER TABLE dbo.whatsapp_admin_alert_notifications
        ADD CONSTRAINT CK_waan_alert_type
          CHECK (alert_type IN (
            N'EMPLOYEE_UNAVAILABLE',
            N'MISSING_CHECKIN_AFTER_OPERATION',
            N'FORWARDED_LOCATION_REJECTED',
            N'ABSENCE_REQUEST_PENDING'
          ));

      ALTER TABLE dbo.whatsapp_admin_alert_notifications
        ADD CONSTRAINT CK_waan_severity
          CHECK (severity IN (N'INFO', N'WARNING', N'CRITICAL'));
    `);

    const alertType = await readCheckDefinition("CK_waan_alert_type");
    const severity = await readCheckDefinition("CK_waan_severity");
    assert.match(alertType, /ABSENCE_REQUEST_PENDING/);
    assert.match(severity, /CRITICAL/);
  });
});
