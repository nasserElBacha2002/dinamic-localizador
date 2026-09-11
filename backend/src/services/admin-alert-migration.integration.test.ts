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
    // Legacy value retained in historical CHECK (101–104); app no longer emits it.
    assert.match(definition, /FORWARDED_LOCATION_REJECTED/);
    assert.match(definition, /ABSENCE_REQUEST_PENDING/);
  });

  it("CK_waan_alert_type includes dynamic attendance alert types after 119", async () => {
    const definition = await readCheckDefinition("CK_waan_alert_type");
    assert.match(definition, /ATTENDANCE_CONFIRMATION_MISSING/);
    assert.match(definition, /MISSING_CHECKIN_AFTER_START/);
    assert.match(definition, /MISSING_CHECKOUT_AFTER_END/);
  });

  it("company_settings exposes dynamic attendance admin columns after 119", async () => {
    const result = await getPool().request().query(`
      SELECT
        COL_LENGTH(N'dbo.company_settings', N'admin_attendance_confirmation_missing_enabled') AS conf,
        COL_LENGTH(N'dbo.company_settings', N'admin_missing_checkin_enabled') AS checkin,
        COL_LENGTH(N'dbo.company_settings', N'admin_missing_checkout_enabled') AS checkout,
        COL_LENGTH(N'dbo.company_settings', N'admin_confirmation_escalation_minutes') AS esc,
        COL_LENGTH(N'dbo.company_settings', N'admin_missing_checkout_delay_minutes') AS delay,
        COL_LENGTH(N'dbo.company_settings', N'admin_alert_max_lateness_minutes') AS max_late
    `);
    const row = result.recordset[0] as Record<string, number | null>;
    assert.ok(row.conf != null && row.conf > 0);
    assert.ok(row.checkin != null && row.checkin > 0);
    assert.ok(row.checkout != null && row.checkout > 0);
    assert.ok(row.esc != null && row.esc > 0);
    assert.ok(row.delay != null && row.delay > 0);
    assert.ok(row.max_late != null && row.max_late > 0);
  });

  it("CK_waan_severity allows INFO WARNING CRITICAL", async () => {
    const definition = await readCheckDefinition("CK_waan_severity");
    assert.match(definition, /INFO/);
    assert.match(definition, /WARNING/);
    assert.match(definition, /CRITICAL/);
  });

  it("migration 120 adds due_at identity columns and terminal statuses", async () => {
    const cols = await getPool().request().query(`
      SELECT
        COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'due_at') AS due_at,
        COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'assignment_id') AS assignment_id,
        COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'employee_workday_id') AS employee_workday_id,
        COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'evaluated_at') AS evaluated_at,
        COL_LENGTH(N'dbo.whatsapp_admin_alert_notifications', N'lateness_minutes') AS lateness_minutes
    `);
    const row = cols.recordset[0] as Record<string, number | null>;
    assert.ok(row.due_at != null && row.due_at > 0);
    assert.ok(row.assignment_id != null && row.assignment_id > 0);
    assert.ok(row.employee_workday_id != null && row.employee_workday_id > 0);
    assert.ok(row.evaluated_at != null && row.evaluated_at > 0);
    assert.ok(row.lateness_minutes != null && row.lateness_minutes > 0);

    const status = await readCheckDefinition("CK_waan_status");
    assert.match(status, /EXPIRED/);
    assert.match(status, /SKIPPED_DISABLED/);
  });

  it("upgrade-safe: dropping and re-applying 103 CHECK leaves same contract", async () => {
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

    await getPool().request().query(`
      IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_waan_alert_type'
          AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
      )
        ALTER TABLE dbo.whatsapp_admin_alert_notifications DROP CONSTRAINT CK_waan_alert_type;

      ALTER TABLE dbo.whatsapp_admin_alert_notifications
        ADD CONSTRAINT CK_waan_alert_type
          CHECK (alert_type IN (
            N'EMPLOYEE_UNAVAILABLE',
            N'MISSING_CHECKIN_AFTER_OPERATION',
            N'FORWARDED_LOCATION_REJECTED',
            N'ABSENCE_REQUEST_PENDING',
            N'ATTENDANCE_THRESHOLD_CROSSED',
            N'ATTENDANCE_CONFIRMATION_MISSING',
            N'MISSING_CHECKIN_AFTER_START',
            N'MISSING_CHECKOUT_AFTER_END'
          ));
    `);
  });
});
