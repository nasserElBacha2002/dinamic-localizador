/**
 * WhatsApp retention outbox terminality — SQL integration (repository SQL is source of truth).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS } from "../constants/admin-alert";
import { ATTENDANCE_REMINDER_MAX_ATTEMPTS } from "../constants/attendance-notification";
import { OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS } from "../constants/operation-assignment-notification";
import { getPool } from "../database/connection";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { whatsappRetentionService } from "./whatsapp-retention.service";

const nowUtc = new Date("2026-08-28T12:00:00.000Z");
const PAYROLL_MAX_ATTEMPTS = 5;

const daysAgo = (days: number): Date => {
  const value = new Date(nowUtc.getTime());
  value.setUTCDate(value.getUTCDate() - days);
  return value;
};

const countRow = async (table: string, id: string): Promise<number> => {
  const row = await getPool()
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query(`SELECT COUNT(*) AS cnt FROM ${table} WHERE id = @id`);
  return Number(row.recordset[0].cnt);
};

const runRetention = async (): Promise<void> => {
  await whatsappRetentionService.runCleanup({
    dryRun: false,
    nowUtc,
    retentionDays: 30,
    batchSize: 200,
    maxBatchesPerTable: 20,
  });
};

describeDatabaseIntegration("whatsapp retention outbox terminality (SQL)", () => {
  const fixtures = createIntegrationFixtureTracker();
  const createdCompanyIds: string[] = [];
  let companyId = "";
  let employeeId = "";
  let operationId = "";
  let adminCompanyId = "";
  let adminRecipientId = "";

  before(async () => {
    process.env.WHATSAPP_RETENTION_CLEANUP_JOB_ENABLED = "true";
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();

    const employee = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `Retention Outbox Emp ${randomUUID().slice(0, 8)}`)
      .input("phone", sql.NVarChar(30), `+54911${String(Date.now()).slice(-8)}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    employeeId = String(employee.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    const location = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `Loc ${randomUUID().slice(0, 6)}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO operational_locations (
          company_id, name, address, locality, latitude, longitude, allowed_radius_meters, active
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, N'Addr', N'CABA', -34.6037, -58.3816, 150, 1);
        SELECT id FROM @inserted;
      `);
    const locationId = String(location.recordset[0].id);

    const operation = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, locationId)
      .input("start", sql.DateTime2, daysAgo(10))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes,
          late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @serviceId, @start, 60, 90, N'COMPLETED', N'ONE_TIME');
        SELECT id FROM @inserted;
      `);
    operationId = String(operation.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const adminFixture = await createPlatformCompanyFixture({
      name: `Retention Outbox Admin ${randomUUID().slice(0, 8)}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Admin Owner",
        email: `retention-outbox-${randomUUID()}@integration.test`,
      },
    });
    adminCompanyId = adminFixture.data.company.id;
    createdCompanyIds.push(adminCompanyId);
    await companySettingsRepository.update(adminCompanyId, { adminAlertsEnabled: true });
    const recipient = await companyAlertRecipientRepository.create(adminCompanyId, {
      phoneNumber: `+54911${Date.now().toString().slice(-8)}`,
      displayName: "Ops",
      isEnabled: true,
      receiveOperationalAlerts: true,
      receiveRequestAlerts: false,
      receiveSecurityAlerts: true,
    });
    adminRecipientId = recipient.id;
  });

  after(async () => {
    for (const id of createdCompanyIds.splice(0)) {
      await deleteCompanyCascade(id);
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  let attendanceCase = 0;

  const insertAttendanceNotification = async (input: {
    status: string;
    attemptCount?: number;
    createdAt: Date;
  }): Promise<string> => {
    attendanceCase += 1;
    const id = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("status", sql.NVarChar(30), input.status)
      .input("attemptCount", sql.Int, input.attemptCount ?? 0)
      .input("scheduleVersion", sql.Int, attendanceCase)
      .input("createdAt", sql.DateTime2, input.createdAt)
      .query(`
        INSERT INTO whatsapp_attendance_notifications (
          id, company_id, operation_id, employee_id, notification_type, status,
          attempt_count, schedule_version, created_at
        )
        VALUES (
          @id, @companyId, @operationId, @employeeId, N'ARRIVAL_REMINDER_15_MIN',
          @status, @attemptCount, @scheduleVersion, @createdAt
        )
      `);
    return id;
  };

  const insertAdminAlertNotification = async (input: {
    status: string;
    attemptCount: number;
    nextAttemptAt?: Date | null;
    activeLease?: boolean;
    createdAt: Date;
    sentAt?: Date | null;
  }): Promise<string> => {
    const id = randomUUID();
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, adminCompanyId)
      .input("recipientId", sql.UniqueIdentifier, adminRecipientId)
      .input("status", sql.NVarChar(30), input.status)
      .input("attemptCount", sql.Int, input.attemptCount)
      .input("nextAttemptAt", sql.DateTime2, input.nextAttemptAt ?? null)
      .input("createdAt", sql.DateTime2, input.createdAt)
      .input("sentAt", sql.DateTime2, input.sentAt ?? null)
      .input("occurredAt", sql.DateTime2, input.createdAt)
      .query(`
        INSERT INTO whatsapp_admin_alert_notifications (
          id, company_id, recipient_id, alert_type, severity, template_category,
          deduplication_key, recipient_phone, content_variables_json, status,
          attempt_count, next_attempt_at, occurred_at, created_at,
          updated_at, sent_at${input.activeLease ? ", lease_expires_at" : ""}
        )
        VALUES (
          @id, @companyId, @recipientId, N'EMPLOYEE_UNAVAILABLE', N'INFO', N'OPERATIONAL',
          N'retention-${id}', N'+5491100000000', N'{}', @status, @attemptCount,
          @nextAttemptAt, @occurredAt, @createdAt, @createdAt, @sentAt${
            input.activeLease ? ", DATEADD(HOUR, 1, SYSUTCDATETIME())" : ""
          }
        )
      `);
    return id;
  };

  const insertPayrollNotification = async (input: {
    status: string;
    attemptCount: number;
    nextAttemptAt?: Date | null;
    activeLease?: boolean;
    createdAt: Date;
    sentAt?: Date | null;
  }): Promise<string> => {
    const pool = getPool();
    const receiptId = randomUUID();
    const batchId = randomUUID();
    const hash = createHash("sha256").update(receiptId).digest();
    const year = 2100 + (hash[0]! % 80);
    const month = 1 + (hash[1]! % 12);

    await pool
      .request()
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .query(`
        INSERT INTO payroll_receipt_batches (id, company_id, year, month, status, total_files)
        VALUES (@batchId, @companyId, @year, @month, N'COMPLETED', 1)
      `);

    await pool
      .request()
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .query(`
        INSERT INTO payroll_receipts (
          id, batch_id, company_id, employee_id, year, month,
          original_filename, storage_provider, storage_object_key, status
        )
        VALUES (
          @receiptId, @batchId, @companyId, @employeeId, @year, @month,
          N'retention-test.pdf', N'GOOGLE_CLOUD_STORAGE', N'test/retention.pdf', N'ASSOCIATED'
        )
      `);

    const id = randomUUID();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("status", sql.NVarChar(30), input.status)
      .input("attemptCount", sql.Int, input.attemptCount)
      .input("nextAttemptAt", sql.DateTime2, input.nextAttemptAt ?? null)
      .input("createdAt", sql.DateTime2, input.createdAt)
      .input("sentAt", sql.DateTime2, input.sentAt ?? null)
      .query(`
        INSERT INTO whatsapp_payroll_receipt_notifications (
          id, company_id, payroll_receipt_id, employee_id, status,
          attempt_count, next_attempt_at, created_at, updated_at, sent_at${
            input.activeLease ? ", lease_expires_at" : ""
          }
        )
        VALUES (
          @id, @companyId, @receiptId, @employeeId, @status, @attemptCount,
          @nextAttemptAt, @createdAt, @createdAt, @sentAt${
            input.activeLease ? ", DATEADD(HOUR, 1, SYSUTCDATETIME())" : ""
          }
        )
      `);
    return id;
  };

  const insertOperationAssignmentNotification = async (input: {
    status: string;
    attemptCount: number;
    nextAttemptAt?: Date | null;
    activeLease?: boolean;
    createdAt: Date;
    sentAt?: Date | null;
  }): Promise<string> => {
    const pool = getPool();
    const assignmentId = randomUUID();
    const workDate = daysAgo(10);
    await pool
      .request()
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until
        )
        VALUES (@assignmentId, @companyId, @operationId, @employeeId, @workDate, @workDate)
      `);

    const id = randomUUID();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("status", sql.NVarChar(30), input.status)
      .input("attemptCount", sql.Int, input.attemptCount)
      .input("nextAttemptAt", sql.DateTime2, input.nextAttemptAt ?? null)
      .input("createdAt", sql.DateTime2, input.createdAt)
      .input("sentAt", sql.DateTime2, input.sentAt ?? null)
      .query(`
        INSERT INTO whatsapp_operation_assignment_notifications (
          id, company_id, operation_assignment_id, operation_id, employee_id, status,
          attempt_count, next_attempt_at, created_at, updated_at, sent_at${
            input.activeLease ? ", lease_expires_at" : ""
          }
        )
        VALUES (
          @id, @companyId, @assignmentId, @operationId, @employeeId, @status,
          @attemptCount, @nextAttemptAt, @createdAt, @createdAt, @sentAt${
            input.activeLease ? ", DATEADD(HOUR, 1, SYSUTCDATETIME())" : ""
          }
        )
      `);
    return id;
  };

  describe("whatsapp_attendance_notifications", () => {
    it("FAILED retryable (attempts below max) is kept even when old", async () => {
      const id = await insertAttendanceNotification({
        status: "FAILED",
        attemptCount: ATTENDANCE_REMINDER_MAX_ATTEMPTS - 1,
        createdAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_attendance_notifications", id), 1);
    });

    it("FAILED terminal (max attempts) is deleted when old", async () => {
      const id = await insertAttendanceNotification({
        status: "FAILED",
        attemptCount: ATTENDANCE_REMINDER_MAX_ATTEMPTS,
        createdAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_attendance_notifications", id), 0);
    });

    it("terminal SENT older than cutoff is deleted", async () => {
      const id = await insertAttendanceNotification({
        status: "SENT",
        createdAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_attendance_notifications", id), 0);
    });

    it("PENDING older than cutoff is kept", async () => {
      const id = await insertAttendanceNotification({
        status: "PENDING",
        createdAt: daysAgo(60),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_attendance_notifications", id), 1);
    });
  });

  describe("whatsapp_admin_alert_notifications", () => {
    it("FAILED retryable with past next_attempt_at is kept", async () => {
      const id = await insertAdminAlertNotification({
        status: "FAILED",
        attemptCount: 1,
        nextAttemptAt: daysAgo(1),
        createdAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_admin_alert_notifications", id), 1);
    });

    it("FAILED retryable with future next_attempt_at is kept", async () => {
      const id = await insertAdminAlertNotification({
        status: "FAILED",
        attemptCount: 1,
        nextAttemptAt: new Date(nowUtc.getTime() + 60_000),
        createdAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_admin_alert_notifications", id), 1);
    });

    it("FAILED terminal (max attempts) is deleted", async () => {
      const id = await insertAdminAlertNotification({
        status: "FAILED",
        attemptCount: ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS,
        createdAt: daysAgo(31),
        sentAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_admin_alert_notifications", id), 0);
    });

    it("FAILED with active lease is kept", async () => {
      const id = await insertAdminAlertNotification({
        status: "FAILED",
        attemptCount: ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS,
        activeLease: true,
        createdAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_admin_alert_notifications", id), 1);
    });

    it("terminal SEND_ACCEPTED older than cutoff is deleted", async () => {
      const id = await insertAdminAlertNotification({
        status: "SEND_ACCEPTED",
        attemptCount: 1,
        createdAt: daysAgo(31),
        sentAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_admin_alert_notifications", id), 0);
    });

    it("PENDING older than cutoff is kept", async () => {
      const id = await insertAdminAlertNotification({
        status: "PENDING",
        attemptCount: 0,
        createdAt: daysAgo(60),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_admin_alert_notifications", id), 1);
    });
  });

  describe("whatsapp_payroll_receipt_notifications", () => {
    it("FAILED retryable is kept", async () => {
      const id = await insertPayrollNotification({
        status: "FAILED",
        attemptCount: 1,
        nextAttemptAt: daysAgo(1),
        createdAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_payroll_receipt_notifications", id), 1);
    });

    it("FAILED terminal is deleted", async () => {
      const id = await insertPayrollNotification({
        status: "FAILED",
        attemptCount: PAYROLL_MAX_ATTEMPTS,
        createdAt: daysAgo(31),
        sentAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_payroll_receipt_notifications", id), 0);
    });

    it("FAILED with active lease is kept", async () => {
      const id = await insertPayrollNotification({
        status: "FAILED",
        attemptCount: PAYROLL_MAX_ATTEMPTS,
        activeLease: true,
        createdAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_payroll_receipt_notifications", id), 1);
    });

    it("terminal SEND_ACCEPTED is deleted when old", async () => {
      const id = await insertPayrollNotification({
        status: "SEND_ACCEPTED",
        attemptCount: 1,
        createdAt: daysAgo(31),
        sentAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_payroll_receipt_notifications", id), 0);
    });
  });

  describe("whatsapp_operation_assignment_notifications", () => {
    it("FAILED retryable is kept", async () => {
      const id = await insertOperationAssignmentNotification({
        status: "FAILED",
        attemptCount: 1,
        nextAttemptAt: daysAgo(1),
        createdAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_operation_assignment_notifications", id), 1);
    });

    it("FAILED terminal is deleted", async () => {
      const id = await insertOperationAssignmentNotification({
        status: "FAILED",
        attemptCount: OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
        createdAt: daysAgo(31),
        sentAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_operation_assignment_notifications", id), 0);
    });

    it("FAILED with active lease is kept", async () => {
      const id = await insertOperationAssignmentNotification({
        status: "FAILED",
        attemptCount: OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
        activeLease: true,
        createdAt: daysAgo(31),
      });
      await runRetention();
      assert.equal(await countRow("whatsapp_operation_assignment_notifications", id), 1);
    });
  });
});
