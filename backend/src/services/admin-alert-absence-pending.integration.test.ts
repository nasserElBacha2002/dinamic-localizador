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
import { formatAbsenceRequestPeriodDisplay } from "../utils/admin-alert/request-template-variables";
import { addDaysToDateIso } from "../utils/recurring-workday-instant";

const uniqueCompanyName = (): string =>
  `Admin Alert Absence ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

const uniqueMessageSid = (): string => `SM${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("admin alert absence pending integration", () => {
  const createdCompanyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
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

  const createRequestRecipient = async (
    companyId: string,
    options?: { receiveRequestAlerts?: boolean; phoneSuffix?: string },
  ) =>
    companyAlertRecipientRepository.create(companyId, {
      phoneNumber: `+54911${options?.phoneSuffix ?? Date.now().toString().slice(-8)}`,
      displayName: "Admin Solicitudes",
      isEnabled: true,
      receiveOperationalAlerts: false,
      receiveRequestAlerts: options?.receiveRequestAlerts ?? true,
      receiveSecurityAlerts: false,
    });

  it("creates REQUEST outbox row for pending WhatsApp absence request", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { companyId, vacation, employee } = await seedCompany();
    await createRequestRecipient(companyId);

    const today = await resolveCompanyTodayIso(companyId);
    const start = addDaysToDateIso(today, 14);
    const end = addDaysToDateIso(today, 20);
    const messageSid = uniqueMessageSid();

    const { detail, isExisting } = await absenceRequestService.createFromWhatsapp(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: start,
      endDate: end,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      reason: "Motivo privado no debe ir al admin",
      sourceMessageSid: messageSid,
    });

    assert.equal(isExisting, false);
    assert.equal(detail.status, "PENDING");

    const dedup = buildAbsencePendingDedupKey(detail.id);
    const outboxCount = await countOutboxForDedup(companyId, dedup);
    assert.equal(outboxCount, 1);

    const row = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dedup", sql.NVarChar(200), dedup)
      .query(`
        SELECT TOP 1 alert_type, template_category, absence_request_id, content_variables_json
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId AND deduplication_key = @dedup
      `);
    const record = row.recordset[0] as Record<string, unknown>;
    assert.equal(String(record.alert_type), "ABSENCE_REQUEST_PENDING");
    assert.equal(String(record.template_category), "REQUEST");
    assert.equal(String(record.absence_request_id), detail.id);

    const vars = JSON.parse(String(record.content_variables_json)) as Record<string, string>;
    assert.equal(vars["1"], "Solicitud de vacaciones");
    assert.equal(vars["2"], "Juan Pérez");
    assert.equal(vars["3"], formatAbsenceRequestPeriodDisplay(start, end));
    assert.equal(vars["4"], "Pendiente de revisión");
    assert.doesNotMatch(JSON.stringify(vars), /Motivo privado|certificado|attachment/i);
  });

  it("does not enqueue alert for auto-approved WhatsApp request", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { companyId, personal, employee } = await seedCompany();
    await createRequestRecipient(companyId);

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
    const dedup = buildAbsencePendingDedupKey(detail.id);
    assert.equal(await countOutboxForDedup(companyId, dedup), 0);
  });

  it("dedupes duplicate WhatsApp inbound by sourceMessageSid", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { companyId, vacation, employee } = await seedCompany();
    await createRequestRecipient(companyId);

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
    assert.equal(first.detail.id, second.detail.id);

    const dedup = buildAbsencePendingDedupKey(first.detail.id);
    assert.equal(await countOutboxForDedup(companyId, dedup), 1);
  });

  it("creates one outbox row per request-enabled recipient", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { companyId, vacation, employee } = await seedCompany();
    await createRequestRecipient(companyId, { phoneSuffix: "11111111" });
    await createRequestRecipient(companyId, { phoneSuffix: "22222222" });
    await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: "+5491133333333",
      displayName: "Ops only",
      isEnabled: true,
      receiveOperationalAlerts: true,
      receiveRequestAlerts: false,
      receiveSecurityAlerts: false,
    });

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

    const dedup = buildAbsencePendingDedupKey(detail.id);
    assert.equal(await countOutboxForDedup(companyId, dedup), 2);
  });

  it("skips enqueue when admin alerts disabled for company", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { companyId, vacation, employee } = await seedCompany({ adminAlertsEnabled: false });
    await createRequestRecipient(companyId);

    const today = await resolveCompanyTodayIso(companyId);
    const day = addDaysToDateIso(today, 18);
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

    const dedup = buildAbsencePendingDedupKey(detail.id);
    assert.equal(await countOutboxForDedup(companyId, dedup), 0);
  });

  it("reconciles pending absence alert after initial emit failure", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    const { companyId, vacation, employee } = await seedCompany();
    await createRequestRecipient(companyId);

    const originalEmit = adminAlertService.emit.bind(adminAlertService);
    let emitCalls = 0;
    mock.method(adminAlertService, "emit", async (...args: Parameters<typeof originalEmit>) => {
      emitCalls += 1;
      if (emitCalls === 1) {
        throw new Error("simulated enqueue failure");
      }
      return originalEmit(...args);
    });

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

    const dedup = buildAbsencePendingDedupKey(detail.id);
    assert.equal(await countOutboxForDedup(companyId, dedup), 0);

    const recovery = await adminAlertReconciliationService.reconcilePendingAbsenceRequests();
    assert.ok(recovery.scanned >= 1);
    assert.equal(await countOutboxForDedup(companyId, dedup), 1);

    mock.restoreAll();
  });

  it("does not cross tenant boundaries for absence_request_id linkage", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    await createRequestRecipient(companyA.companyId);
    await createRequestRecipient(companyB.companyId);

    const todayA = await resolveCompanyTodayIso(companyA.companyId);
    const day = addDaysToDateIso(todayA, 20);
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

    const dedupA = buildAbsencePendingDedupKey(createdA.detail.id);
    assert.equal(await countOutboxForDedup(companyA.companyId, dedupA), 1);
    assert.equal(await countOutboxForDedup(companyB.companyId, dedupA), 0);

    const foreign = await getPool()
      .request()
      .input("companyB", sql.UniqueIdentifier, companyB.companyId)
      .input("requestA", sql.UniqueIdentifier, createdA.detail.id)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyB
          AND absence_request_id = @requestA
      `);
    assert.equal(Number(foreign.recordset[0]?.total ?? 0), 0);
  });
});
