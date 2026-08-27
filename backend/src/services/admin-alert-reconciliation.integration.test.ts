import assert from "node:assert/strict";
import { after, before, it, mock } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { absenceBalanceRepository } from "../repositories/absence-balance.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import {
  describeDatabaseIntegration,
  resolveCompanyTodayIso,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { buildAbsencePendingDedupKey } from "../utils/admin-alert/dedup-keys";

const uniqueCompanyName = (): string =>
  `Admin Alert Recon ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (suffix?: string): string =>
  `+54911${(suffix ?? Date.now().toString()).slice(-8)}`;

const uniqueMessageSid = (): string => `SM${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("admin alert reconciliation corrections", () => {
  const createdCompanyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        DELETE FROM whatsapp_admin_alert_notification_send_attempts WHERE company_id = @companyId;
        DELETE FROM whatsapp_admin_alert_notifications WHERE company_id = @companyId;
        DELETE FROM company_alert_recipients WHERE company_id = @companyId;
        DELETE FROM absence_request_events WHERE company_id = @companyId;
        DELETE FROM absence_workday_sync_jobs WHERE company_id = @companyId;
        DELETE FROM absence_requests WHERE company_id = @companyId;
        DELETE FROM employee_absence_balances WHERE company_id = @companyId;
        DELETE FROM employees WHERE company_id = @companyId;
        DELETE FROM company_absence_settings WHERE company_id = @companyId;
        DELETE FROM absence_types WHERE company_id = @companyId;
        DELETE FROM user_company_memberships WHERE company_id = @companyId;
        DELETE FROM company_settings WHERE company_id = @companyId;
        DELETE FROM company_modules WHERE company_id = @companyId;
        DELETE FROM company_location_types WHERE company_id = @companyId;
        DELETE FROM company_work_schedule_days WHERE company_id = @companyId;
        DELETE FROM company_work_schedules WHERE company_id = @companyId;
        DELETE FROM company_calendar_dates WHERE company_id = @companyId;
        DELETE FROM company_work_calendar_weekdays WHERE company_id = @companyId;
        DELETE FROM company_work_calendars WHERE company_id = @companyId;
        DELETE FROM user_invitations WHERE company_id = @companyId;
        DELETE FROM audit_logs WHERE company_id = @companyId;
        DELETE FROM companies WHERE id = @companyId;
      `);
    }
    await teardownDatabaseIntegration();
  });

  const countOutbox = async (companyId: string, dedup: string): Promise<number> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dedup", sql.NVarChar(200), dedup)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId AND deduplication_key = @dedup
      `);
    return Number(result.recordset[0]?.total ?? 0);
  };

  const seedCompany = async (adminAlertsEnabled: boolean) => {
    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Recon Owner",
        email: `recon-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);

    await companySettingsRepository.update(companyId, { adminAlertsEnabled });

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE absence_types
        SET requires_approval = 1, deducts_balance = 1
        WHERE company_id = @companyId AND code = N'VACATION';
      `);

    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((t) => t.code === "VACATION");
    assert.ok(vacation);

    const employee = await employeeRepository.create(companyId, {
      name: "Juan Pérez",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    const year = Number((await resolveCompanyTodayIso(companyId)).slice(0, 4));
    await absenceBalanceRepository.upsert(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      year,
      totalDays: 120,
      notes: null,
    });

    return { companyId, vacation, employee };
  };

  it("does not backfill absence created before adminAlertsEnabledAt", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    const { companyId, vacation, employee } = await seedCompany(false);
    await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: uniquePhone("11110001"),
      displayName: "Admin",
      isEnabled: true,
      receiveOperationalAlerts: false,
      receiveRequestAlerts: true,
      receiveSecurityAlerts: false,
    });

    const { detail } = await absenceRequestService.createFromWhatsapp(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: "2026-10-01",
      endDate: "2026-10-01",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "Antes de habilitar",
      sourceMessageSid: uniqueMessageSid(),
    });
    assert.equal(detail.status, "PENDING");

    await companySettingsRepository.update(companyId, { adminAlertsEnabled: true });

    const recovery = await adminAlertReconciliationService.reconcilePendingAbsenceRequests();
    const dedup = buildAbsencePendingDedupKey(detail.id);
    assert.equal(await countOutbox(companyId, dedup), 0);
    assert.equal(recovery.recovered, 0);
  });

  it("does not alert a recipient created after the absence event", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    const { companyId, vacation, employee } = await seedCompany(true);
    const early = await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: uniquePhone("11110002"),
      displayName: "Early",
      isEnabled: true,
      receiveOperationalAlerts: false,
      receiveRequestAlerts: true,
      receiveSecurityAlerts: false,
    });

    const { detail } = await absenceRequestService.createFromWhatsapp(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: "2026-10-02",
      endDate: "2026-10-02",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "Con early",
      sourceMessageSid: uniqueMessageSid(),
    });

    const dedup = buildAbsencePendingDedupKey(detail.id);
    assert.equal(await countOutbox(companyId, dedup), 1);

    const late = await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: uniquePhone("11110003"),
      displayName: "Late",
      isEnabled: true,
      receiveOperationalAlerts: false,
      receiveRequestAlerts: true,
      receiveSecurityAlerts: false,
    });

    await adminAlertReconciliationService.reconcilePendingAbsenceRequests();
    assert.equal(await countOutbox(companyId, dedup), 1);

    const lateRows = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("recipientId", sql.UniqueIdentifier, late.id)
      .input("dedup", sql.NVarChar(200), dedup)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId
          AND recipient_id = @recipientId
          AND deduplication_key = @dedup
      `);
    assert.equal(Number(lateRows.recordset[0]?.total ?? 0), 0);

    const earlyRows = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("recipientId", sql.UniqueIdentifier, early.id)
      .input("dedup", sql.NVarChar(200), dedup)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId
          AND recipient_id = @recipientId
          AND deduplication_key = @dedup
      `);
    assert.equal(Number(earlyRows.recordset[0]?.total ?? 0), 1);
  });

  it("recovers only the missing recipient after partial enqueue", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    const { companyId, vacation, employee } = await seedCompany(true);
    const recipientA = await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: uniquePhone("11110004"),
      displayName: "A",
      isEnabled: true,
      receiveOperationalAlerts: false,
      receiveRequestAlerts: true,
      receiveSecurityAlerts: false,
    });
    const recipientB = await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: uniquePhone("11110005"),
      displayName: "B",
      isEnabled: true,
      receiveOperationalAlerts: false,
      receiveRequestAlerts: true,
      receiveSecurityAlerts: false,
    });

    const originalEmit = adminAlertService.emit.bind(adminAlertService);
    mock.method(adminAlertService, "emit", async (input: Parameters<typeof originalEmit>[0]) => {
      const onlyA = {
        ...input,
      };
      // Force enqueue for A only by temporarily disabling B via a one-shot emit that filters.
      const result = await originalEmit(onlyA);
      // Delete B's rows if any were created so we simulate partial failure.
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("recipientId", sql.UniqueIdentifier, recipientB.id)
        .query(`
          DELETE FROM whatsapp_admin_alert_notifications
          WHERE company_id = @companyId AND recipient_id = @recipientId
        `);
      return result;
    });

    const { detail } = await absenceRequestService.createFromWhatsapp(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: "2026-10-03",
      endDate: "2026-10-03",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "Partial",
      sourceMessageSid: uniqueMessageSid(),
    });
    mock.restoreAll();

    const dedup = buildAbsencePendingDedupKey(detail.id);
    assert.equal(await countOutbox(companyId, dedup), 1);

    const beforeB = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("recipientId", sql.UniqueIdentifier, recipientB.id)
      .input("dedup", sql.NVarChar(200), dedup)
      .query(`
        SELECT COUNT(*) AS total FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId AND recipient_id = @recipientId AND deduplication_key = @dedup
      `);
    assert.equal(Number(beforeB.recordset[0]?.total ?? 0), 0);

    const recovery = await adminAlertReconciliationService.reconcilePendingAbsenceRequests();
    assert.ok(recovery.recovered >= 1);
    assert.equal(await countOutbox(companyId, dedup), 2);

    const afterA = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("recipientId", sql.UniqueIdentifier, recipientA.id)
      .input("dedup", sql.NVarChar(200), dedup)
      .query(`
        SELECT COUNT(*) AS total FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId AND recipient_id = @recipientId AND deduplication_key = @dedup
      `);
    assert.equal(Number(afterA.recordset[0]?.total ?? 0), 1);
  });

  it("anti-starvation: missing obligation advances past already-materialized peers", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    const { companyId, vacation, employee } = await seedCompany(true);
    await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: uniquePhone("11110006"),
      displayName: "Only",
      isEnabled: true,
      receiveOperationalAlerts: false,
      receiveRequestAlerts: true,
      receiveSecurityAlerts: false,
    });

    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const day = new Date(Date.UTC(2027, 2, 1 + i));
      const iso = day.toISOString().slice(0, 10);
      const { detail } = await absenceRequestService.createFromWhatsapp(companyId, {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: iso,
        endDate: iso,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: `Starvation ${i}`,
        sourceMessageSid: uniqueMessageSid(),
      });
      ids.push(detail.id);
    }

    const targetId = ids[0]!;
    const targetDedup = buildAbsencePendingDedupKey(targetId);
    assert.equal(await countOutbox(companyId, targetDedup), 1);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dedup", sql.NVarChar(200), targetDedup)
      .query(`
        DELETE FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId AND deduplication_key = @dedup
      `);
    assert.equal(await countOutbox(companyId, targetDedup), 0);

    mock.method(adminAlertService, "emit", async () => ({
      enqueued: 0,
      dedupSkipped: 0,
      recipientSkipped: 0,
    }));

    // Small batch; anti-join must still surface the missing oldest obligation.
    const recovery = await adminAlertReconciliationService.reconcilePendingAbsenceRequests(5);
    mock.restoreAll();

    assert.ok(recovery.scanned >= 1);
    assert.equal(await countOutbox(companyId, targetDedup), 1);
  });

  it("concurrent reconcile does not duplicate outbox rows", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    const { companyId, vacation, employee } = await seedCompany(true);
    await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: uniquePhone("11110007"),
      displayName: "Concurrent",
      isEnabled: true,
      receiveOperationalAlerts: false,
      receiveRequestAlerts: true,
      receiveSecurityAlerts: false,
    });

    mock.method(adminAlertService, "emit", async () => {
      throw new Error("force reconciliation path");
    });

    const { detail } = await absenceRequestService.createFromWhatsapp(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "Concurrent",
      sourceMessageSid: uniqueMessageSid(),
    });
    mock.restoreAll();

    const dedup = buildAbsencePendingDedupKey(detail.id);
    assert.equal(await countOutbox(companyId, dedup), 0);

    await Promise.all([
      adminAlertReconciliationService.reconcilePendingAbsenceRequests(),
      adminAlertReconciliationService.reconcilePendingAbsenceRequests(),
    ]);

    assert.equal(await countOutbox(companyId, dedup), 1);

    await adminAlertReconciliationService.reconcilePendingAbsenceRequests();
    assert.equal(await countOutbox(companyId, dedup), 1);
  });
});
