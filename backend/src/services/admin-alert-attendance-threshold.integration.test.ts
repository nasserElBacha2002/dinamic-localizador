import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { attendanceAlertStateRepository } from "../repositories/attendance-alert-state.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { buildAttendanceThresholdDedupKey } from "../utils/admin-alert/dedup-keys";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("admin alert attendance threshold phase D", () => {
  const createdCompanyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    for (const companyId of createdCompanyIds.splice(0)) {
      await deleteCompanyCascade(companyId);
    }
    await teardownDatabaseIntegration();
  });

  const seed = async () => {
    const suffix = uniqueSuffix();
    const created = await createPlatformCompanyFixture({
      name: `Threshold ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `threshold-${suffix}@integration.test` },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);

    await companySettingsRepository.update(companyId, {
      adminAlertsEnabled: true,
      attendanceThresholdAlertsEnabled: true,
      attendanceAlertThresholdPercent: 80,
      attendanceAlertWindowDays: 30,
      attendanceAlertMinimumWorkdays: 5,
      attendanceAlertCooldownDays: 7,
    });

    const recipient = await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: `+54911${Date.now().toString().slice(-8)}`,
      displayName: "Ops",
      isEnabled: true,
      receiveOperationalAlerts: true,
      receiveRequestAlerts: false,
      receiveSecurityAlerts: false,
    });

    const employee = await employeeRepository.create(companyId, {
      name: "Juan Threshold",
      phoneNumber: `+54911${Date.now().toString().slice(-8)}`,
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    return { companyId, recipient, employeeId: employee.id };
  };

  it("migration exposes Phase D tables and settings columns", async () => {
    const cols = await getPool().request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.company_settings')
        AND name IN (
          N'attendance_threshold_alerts_enabled',
          N'attendance_alert_threshold_percent',
          N'attendance_alert_window_days',
          N'attendance_alert_minimum_workdays',
          N'attendance_alert_cooldown_days',
          N'attendance_alert_config_version'
        )
    `);
    assert.equal(cols.recordset.length, 6);

    const tables = await getPool().request().query(`
      SELECT name FROM sys.tables
      WHERE name IN (N'employee_attendance_alert_state', N'attendance_alert_evaluation_queue')
    `);
    assert.equal(tables.recordset.length, 2);

    const ck = await getPool().request().query(`
      SELECT definition FROM sys.check_constraints
      WHERE name = N'CK_waan_alert_type'
        AND parent_object_id = OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications')
    `);
    assert.match(String(ck.recordset[0]?.definition ?? ""), /ATTENDANCE_THRESHOLD_CROSSED/);
  });

  it("enabling feature bumps config version and does not create outbox by itself", async () => {
    const { companyId } = await seed();
    const before = await companySettingsRepository.findByCompanyId(companyId);
    assert.ok(before);
    const versionBefore = before!.attendanceAlertConfigVersion;

    await companySettingsRepository.update(companyId, {
      attendanceAlertThresholdPercent: 85,
    });
    const after = await companySettingsRepository.findByCompanyId(companyId);
    assert.ok(after!.attendanceAlertConfigVersion > versionBefore);

    const outbox = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId
          AND alert_type = N'ATTENDANCE_THRESHOLD_CROSSED'
      `);
    assert.equal(Number(outbox.recordset[0]?.total ?? 0), 0);
  });

  it("persists state + pending alert and recovers missing outbox via reconcile", async () => {
    const { companyId, employeeId, recipient } = await seed();
    const { attendanceThresholdAlertService } = await import(
      "./attendance-threshold-alert.service"
    );

    // Seed ABOVE state then force evaluate with mocked metrics via direct state + pending.
    await attendanceAlertStateRepository.upsertState({
      companyId,
      employeeId,
      currentBand: "BELOW",
      lastRate: 70,
      lastPresentWorkdays: 7,
      lastAbsentWorkdays: 3,
      lastEvaluatedWorkdays: 10,
      lastCrossedBelowAt: new Date(),
      lastAlertedAt: new Date(),
      crossingSequence: 1,
      pendingAlertCrossingSequence: 1,
      pendingAlertOccurredAt: new Date(),
      pendingAlertRate: 70,
      pendingAlertEvaluatedWorkdays: 10,
      configVersion: (
        await companySettingsRepository.findByCompanyId(companyId)
      )!.attendanceAlertConfigVersion,
    });

    const recovery = await attendanceThresholdAlertService.reconcilePendingCrossingAlerts();
    assert.ok(recovery.scanned >= 1);

    const dedup = buildAttendanceThresholdDedupKey(employeeId, 1);
    const outbox = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dedup", sql.NVarChar(200), dedup)
      .input("recipientId", sql.UniqueIdentifier, recipient.id)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId
          AND deduplication_key = @dedup
          AND recipient_id = @recipientId
      `);
    assert.equal(Number(outbox.recordset[0]?.total ?? 0), 1);

    const again = await attendanceThresholdAlertService.reconcilePendingCrossingAlerts();
    assert.equal(Number(outbox.recordset[0]?.total ?? 0), 1);
    void again;

    const after = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dedup", sql.NVarChar(200), dedup)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId AND deduplication_key = @dedup
      `);
    assert.equal(Number(after.recordset[0]?.total ?? 0), 1);
  });

  it("queue claim is exclusive under concurrent workers", async () => {
    const { companyId, employeeId } = await seed();
    const { attendanceAlertEvaluationQueueRepository } = await import(
      "../repositories/attendance-alert-state.repository"
    );

    await attendanceAlertEvaluationQueueRepository.markDirty(companyId, employeeId);

    const [a, b] = await Promise.all([
      attendanceAlertEvaluationQueueRepository.claimNextOne(`w-a-${uniqueSuffix()}`, 30),
      attendanceAlertEvaluationQueueRepository.claimNextOne(`w-b-${uniqueSuffix()}`, 30),
    ]);

    const claimed = [a, b].filter(Boolean);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0]!.employeeId.toLowerCase(), employeeId.toLowerCase());
  });
});
