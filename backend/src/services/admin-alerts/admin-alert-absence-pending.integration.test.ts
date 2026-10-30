import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it, mock } from "node:test";
import sql from "mssql";
import { getPool } from "../../database/connection";
import { adminAlertNotificationRepository } from "../../repositories/admin-alerts/admin-alert-notification.repository";
import { absenceBalanceRepository } from "../../repositories/absence/absence-balance.repository";
import { absenceTypeRepository } from "../../repositories/absence/absence-type.repository";
import { companyAlertRecipientRepository } from "../../repositories/companies/company-alert-recipient.repository";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import { employeeRepository } from "../../repositories/employees/employee.repository";
import { userRepository } from "../../repositories/identity/user.repository";
import { createPlatformCompanyFixture } from "../../test-helpers/platform-company-fixture";
import {
  describeDatabaseIntegration,
  resolveCompanyTodayIso,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import {
  buildAbsenceCreatedOperationalDedupKey,
  buildAbsencePendingDedupKey,
} from "../../utils/admin-alert/dedup-keys";
import { addDaysToDateIso } from "../../utils/workdays/recurring-workday-instant";

const uniqueCompanyName = (): string =>
  `Admin Alert Absence ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

const uniqueMessageSid = (): string => `SM${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

const createdOperationalDedup = (requestId: string): string =>
  buildAbsenceCreatedOperationalDedupKey(requestId);

describeDatabaseIntegration("admin alert absence created integration", () => {
  const createdCompanyIds: string[] = [];
  let actorUserId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin?.id);
    actorUserId = admin.id;
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        DELETE FROM whatsapp_admin_alert_notification_send_attempts
        WHERE company_id = @companyId;
        DELETE FROM whatsapp_admin_alert_notifications WHERE company_id = @companyId;
        DELETE FROM company_alert_recipients WHERE company_id = @companyId;
        DELETE FROM absence_request_events WHERE company_id = @companyId;
        DELETE FROM absence_workday_sync_jobs WHERE company_id = @companyId;
        DELETE FROM absence_requests WHERE company_id = @companyId;
        DELETE FROM employee_absence_balances WHERE company_id = @companyId;
        DELETE FROM employees WHERE company_id = @companyId;
        DELETE FROM employee_categories WHERE company_id = @companyId;
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
        DELETE FROM company_location_zones WHERE company_id = @companyId;
        DELETE FROM companies WHERE id = @companyId;
      `);
    }
    await teardownDatabaseIntegration();
  });

  const countOutboxForDedup = async (companyId: string, deduplicationKey: string): Promise<number> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("deduplicationKey", sql.NVarChar(200), deduplicationKey)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId
          AND deduplication_key = @deduplicationKey
      `);
    return Number(result.recordset[0]?.total ?? 0);
  };

  const countOutboxForRequest = async (companyId: string, requestId: string): Promise<number> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("requestId", sql.UniqueIdentifier, requestId)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId
          AND absence_request_id = @requestId
      `);
    return Number(result.recordset[0]?.total ?? 0);
  };

  const seedCompany = async (options?: { adminAlertsEnabled?: boolean }) => {
    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Alert Owner",
        email: `alert-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);

    await companySettingsRepository.update(companyId, {
      adminAlertsEnabled: options?.adminAlertsEnabled ?? true,
    });

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE absence_types
        SET requires_approval = 1, deducts_balance = 1
        WHERE company_id = @companyId AND code = N'VACATION';

        UPDATE absence_types
        SET requires_approval = 0, deducts_balance = 0
        WHERE company_id = @companyId AND code = N'PERSONAL_PROCEDURE';
      `);

    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((type) => type.code === "VACATION");
    const personal = types.find((type) => type.code === "PERSONAL_PROCEDURE");
    assert.ok(vacation);
    assert.ok(personal);

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
      totalDays: 20,
    });

    return { companyId, vacation, personal, employee };
  };

  const createOperationalRecipient = async (
    companyId: string,
    options?: { phoneSuffix?: string; alsoRequestAlerts?: boolean },
  ) =>
    companyAlertRecipientRepository.create(companyId, {
      phoneNumber: `+54911${options?.phoneSuffix ?? Date.now().toString().slice(-8)}`,
      displayName: "Admin Operaciones",
      isEnabled: true,
      receiveOperationalAlerts: true,
      receiveRequestAlerts: options?.alsoRequestAlerts ?? false,
      receiveSecurityAlerts: false,
    });

  it("creates OPERATIONAL outbox row for pending WhatsApp absence request", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { companyId, vacation, employee } = await seedCompany();
    await createOperationalRecipient(companyId);

    const today = await resolveCompanyTodayIso(companyId);
    const start = addDaysToDateIso(today, 14);
    const end = addDaysToDateIso(today, 20);

    const { detail, isExisting } = await absenceRequestService.createFromWhatsapp(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: start,
      endDate: end,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "Motivo privado no debe ir al admin",
      sourceMessageSid: uniqueMessageSid(),
    });

    assert.equal(isExisting, false);
    assert.equal(detail.status, "PENDING");

    const dedup = createdOperationalDedup(detail.id);
    assert.equal(await countOutboxForDedup(companyId, dedup), 1);
    assert.equal(await countOutboxForDedup(companyId, buildAbsencePendingDedupKey(detail.id)), 0);

    const row = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dedup", sql.NVarChar(200), dedup)
      .query(`
        SELECT TOP 1 template_category, content_variables_json
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId AND deduplication_key = @dedup
      `);
    const record = row.recordset[0] as Record<string, unknown>;
    assert.equal(String(record.template_category), "OPERATIONAL");
    const vars = JSON.parse(String(record.content_variables_json)) as Record<string, string>;
    assert.match(vars["3"], /Pendiente de revisión/);
    assert.doesNotMatch(JSON.stringify(vars), /Motivo privado|certificado|attachment/i);
  });

  it("creates OPERATIONAL outbox row for pending admin absence request", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { companyId, vacation, employee } = await seedCompany();
    await createOperationalRecipient(companyId);

    const today = await resolveCompanyTodayIso(companyId);
    const start = addDaysToDateIso(today, 21);
    const end = addDaysToDateIso(today, 23);

    const detail = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: start,
        endDate: end,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Motivo privado admin",
      },
      actorUserId,
    );

    assert.equal(detail.status, "PENDING");
    assert.equal(await countOutboxForDedup(companyId, createdOperationalDedup(detail.id)), 1);
  });

  it("creates OPERATIONAL alert for auto-approved WhatsApp request with approved status copy", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { companyId, personal, employee } = await seedCompany();
    await createOperationalRecipient(companyId);

    const today = await resolveCompanyTodayIso(companyId);
    const day = addDaysToDateIso(today, 15);
    const { detail } = await absenceRequestService.createFromWhatsapp(companyId, {
      employeeId: employee.id,
      absenceTypeId: personal.id,
      startDate: day,
      endDate: day,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "Trámite",
      sourceMessageSid: uniqueMessageSid(),
    });

    assert.equal(detail.status, "APPROVED");
    const dedup = createdOperationalDedup(detail.id);
    assert.equal(await countOutboxForDedup(companyId, dedup), 1);

    const row = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dedup", sql.NVarChar(200), dedup)
      .query(`
        SELECT TOP 1 content_variables_json
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId AND deduplication_key = @dedup
      `);
    const vars = JSON.parse(String(row.recordset[0]?.content_variables_json)) as Record<string, string>;
    assert.match(vars["3"], /Aprobada/);
    assert.doesNotMatch(vars["3"], /Pendiente de revisión/);
  });

  it("dedupes duplicate WhatsApp inbound by sourceMessageSid", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { companyId, vacation, employee } = await seedCompany();
    await createOperationalRecipient(companyId);

    const today = await resolveCompanyTodayIso(companyId);
    const day = addDaysToDateIso(today, 16);
    const messageSid = uniqueMessageSid();
    const input = {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: day,
      endDate: day,
      startPeriod: "FULL_DAY" as const,
      endPeriod: "FULL_DAY" as const,
      reason: "Vacaciones",
      sourceMessageSid: messageSid,
    };

    const first = await absenceRequestService.createFromWhatsapp(companyId, input);
    const second = await absenceRequestService.createFromWhatsapp(companyId, input);

    assert.equal(first.isExisting, false);
    assert.equal(second.isExisting, true);
    assert.equal(await countOutboxForDedup(companyId, createdOperationalDedup(first.detail.id)), 1);
  });

  it("does not duplicate creation alerts when operational and request toggles are both enabled", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { companyId, vacation, employee } = await seedCompany();
    await createOperationalRecipient(companyId, { alsoRequestAlerts: true });

    const today = await resolveCompanyTodayIso(companyId);
    const day = addDaysToDateIso(today, 17);
    const { detail } = await absenceRequestService.createFromWhatsapp(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: day,
      endDate: day,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "Estudio",
      sourceMessageSid: uniqueMessageSid(),
    });

    assert.equal(await countOutboxForRequest(companyId, detail.id), 1);
    const categories = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("requestId", sql.UniqueIdentifier, detail.id)
      .query(`
        SELECT template_category
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId AND absence_request_id = @requestId
      `);
    assert.equal(categories.recordset.length, 1);
    assert.equal(String(categories.recordset[0]?.template_category), "OPERATIONAL");
  });

  it("creates one operational outbox row per operational recipient", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { companyId, vacation, employee } = await seedCompany();
    await createOperationalRecipient(companyId, { phoneSuffix: "11111111" });
    await createOperationalRecipient(companyId, { phoneSuffix: "22222222" });

    const today = await resolveCompanyTodayIso(companyId);
    const day = addDaysToDateIso(today, 18);
    const detail = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: day,
        endDate: day,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Vacaciones",
      },
      actorUserId,
    );

    assert.equal(await countOutboxForRequest(companyId, detail.id), 2);
  });

  it("skips enqueue when admin alerts disabled for company", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { companyId, vacation, employee } = await seedCompany({ adminAlertsEnabled: false });
    await createOperationalRecipient(companyId);

    const today = await resolveCompanyTodayIso(companyId);
    const day = addDaysToDateIso(today, 19);
    const { detail } = await absenceRequestService.createFromWhatsapp(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: day,
      endDate: day,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "Vacaciones",
      sourceMessageSid: uniqueMessageSid(),
    });

    assert.equal(await countOutboxForDedup(companyId, createdOperationalDedup(detail.id)), 0);
  });

  it("reconciles creation alert after initial emit failure while still pending", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    const { companyId, vacation, employee } = await seedCompany();
    await createOperationalRecipient(companyId);

    mock.method(adminAlertService, "emit", async () => {
      throw new Error("simulated enqueue failure");
    });

    const today = await resolveCompanyTodayIso(companyId);
    const day = addDaysToDateIso(today, 20);
    const { detail } = await absenceRequestService.createFromWhatsapp(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: day,
      endDate: day,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "Vacaciones",
      sourceMessageSid: uniqueMessageSid(),
    });

    const dedup = createdOperationalDedup(detail.id);
    assert.equal(await countOutboxForDedup(companyId, dedup), 0);

    mock.restoreAll();

    const recovery = await adminAlertReconciliationService.reconcilePendingAbsenceRequests();
    assert.ok(recovery.scanned >= 1);
    assert.equal(await countOutboxForDedup(companyId, dedup), 1);

    const second = await adminAlertReconciliationService.reconcilePendingAbsenceRequests();
    assert.equal(await countOutboxForDedup(companyId, dedup), 1);
    assert.equal(second.recovered, 0);
  });

  it("reconciles creation alert after emit failure even if request was approved", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { absenceReviewService } = await import("../absence/absence-review.service");
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    const { companyId, vacation, employee } = await seedCompany();
    await createOperationalRecipient(companyId);

    mock.method(adminAlertService, "emit", async () => {
      throw new Error("simulated enqueue failure");
    });

    const today = await resolveCompanyTodayIso(companyId);
    const day = addDaysToDateIso(today, 25);
    const detail = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: day,
        endDate: day,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Vacaciones",
      },
      actorUserId,
    );

    await absenceReviewService.approve(companyId, detail.id, actorUserId);
    mock.restoreAll();

    const dedup = createdOperationalDedup(detail.id);
    assert.equal(await countOutboxForDedup(companyId, dedup), 0);

    await adminAlertReconciliationService.reconcilePendingAbsenceRequests();
    assert.equal(await countOutboxForDedup(companyId, dedup), 1);

    const row = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dedup", sql.NVarChar(200), dedup)
      .query(`
        SELECT TOP 1 content_variables_json
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId AND deduplication_key = @dedup
      `);
    const vars = JSON.parse(String(row.recordset[0]?.content_variables_json)) as Record<string, string>;
    assert.match(vars["3"], /Aprobada/);
  });

  it("concurrent enqueue keeps one row per recipient and deduplication key", async () => {
    const { companyId } = await seedCompany();
    const recipient = await createOperationalRecipient(companyId);
    const dedup = `absence-created:operational:${randomUUID()}`;
    const base = {
      companyId,
      recipientId: recipient.id,
      employeeId: null,
      operationId: null,
      absenceRequestId: null,
      alertType: "ABSENCE_REQUEST_PENDING" as const,
      severity: "INFO" as const,
      templateCategory: "OPERATIONAL" as const,
      deduplicationKey: dedup,
      recipientPhone: recipient.phoneNumber,
      contentVariablesJson: JSON.stringify({ "1": "T", "2": "E", "3": "D", "4": "C" }),
      occurredAt: new Date(),
    };

    const [first, second] = await Promise.all([
      adminAlertNotificationRepository.enqueue(base),
      adminAlertNotificationRepository.enqueue(base),
    ]);

    assert.equal(Number(first.created) + Number(second.created), 1);
    assert.equal(await countOutboxForDedup(companyId, dedup), 1);
  });

  it("does not cross tenant boundaries for absence_request_id linkage", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    await createOperationalRecipient(companyA.companyId);
    await createOperationalRecipient(companyB.companyId);

    const todayA = await resolveCompanyTodayIso(companyA.companyId);
    const day = addDaysToDateIso(todayA, 26);
    const createdA = await absenceRequestService.createFromWhatsapp(companyA.companyId, {
      employeeId: companyA.employee.id,
      absenceTypeId: companyA.vacation.id,
      startDate: day,
      endDate: day,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "A",
      sourceMessageSid: uniqueMessageSid(),
    });

    const dedupA = createdOperationalDedup(createdA.detail.id);
    assert.equal(await countOutboxForDedup(companyA.companyId, dedupA), 1);
    assert.equal(await countOutboxForDedup(companyB.companyId, dedupA), 0);
  });

  it("does not enqueue new creation alert after approve", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { absenceReviewService } = await import("../absence/absence-review.service");
    const { companyId, vacation, employee } = await seedCompany();
    await createOperationalRecipient(companyId);

    const today = await resolveCompanyTodayIso(companyId);
    const day = addDaysToDateIso(today, 22);
    const detail = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: day,
        endDate: day,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Vacaciones",
      },
      actorUserId,
    );

    const beforeApprove = await countOutboxForRequest(companyId, detail.id);
    assert.equal(beforeApprove, 1);

    await absenceReviewService.approve(companyId, detail.id, actorUserId);
    assert.equal(await countOutboxForRequest(companyId, detail.id), beforeApprove);
  });

  it("creates pending request when no alert recipients are configured", async () => {
    const { absenceRequestService } = await import("../absence/absence-request.service");
    const { companyId, vacation, employee } = await seedCompany();

    const today = await resolveCompanyTodayIso(companyId);
    const day = addDaysToDateIso(today, 24);
    const detail = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: day,
        endDate: day,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Vacaciones",
      },
      actorUserId,
    );

    assert.equal(detail.status, "PENDING");
    assert.equal(await countOutboxForRequest(companyId, detail.id), 0);
  });
});
