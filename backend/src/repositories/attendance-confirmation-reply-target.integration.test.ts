import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
  createIntegrationFixtureTracker,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { attendanceNotificationRepository } from "../repositories/attendance-notification.repository";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("findConfirmationReplyTarget correlation", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let serviceId = "";

  before(async () => {
    await setupDatabaseIntegration();
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const serviceResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    serviceId = String(serviceResult.recordset[0]?.id ?? "");
    assert.ok(serviceId);
  });

  after(async () => {
    try {
      await fixtures.cleanup();
    } catch (error) {
      console.warn("[findConfirmationReplyTarget] cleanup failed", error);
    }
    await teardownDatabaseIntegration();
  });

  const insertOperation = async (scheduledStart: Date, status = "SCHEDULED") => {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, scheduledStart)
      .input("status", sql.NVarChar(20), status)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, N'ONE_TIME', @scheduledStart, 60, 90, @status)
      `);
    const operationId = String(result.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);
    return operationId;
  };

  const insertEmployee = async () => {
    const pool = getPool();
    const phone = uniquePhone(Math.floor(Math.random() * 9));
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), phone)
      .input("name", sql.NVarChar(120), `Confirm Corr ${Date.now()}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(result.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);
    return employeeId;
  };

  const insertAssignment = async (
    operationId: string,
    employeeId: string,
    confirmationStatus: string,
    scheduleVersion: number,
    scheduledStart: Date,
  ) => {
    const pool = getPool();
    const assignmentId = crypto.randomUUID();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, assignmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("status", sql.NVarChar(20), confirmationStatus)
      .input("scheduleVersion", sql.Int, scheduleVersion)
      .input("scheduledStart", sql.DateTime2, scheduledStart)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until,
          confirmation_status, confirmation_schedule_version
        )
        VALUES (
          @id, @companyId, @operationId, @employeeId,
          CAST(@scheduledStart AS DATE), CAST(@scheduledStart AS DATE),
          @status, @scheduleVersion
        )
      `);
    return assignmentId;
  };

  const insertSentReminder = async (
    operationId: string,
    employeeId: string,
    scheduleVersion: number,
    sentAt: Date,
  ) => {
    const pool = getPool();
    const notificationId = crypto.randomUUID();
    const sid = `SM_CORR_${notificationId.replace(/-/g, "").slice(0, 24)}`;
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, notificationId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("scheduleVersion", sql.Int, scheduleVersion)
      .input("sentAt", sql.DateTime2, sentAt)
      .input("sid", sql.NVarChar(64), sid)
      .query(`
        INSERT INTO whatsapp_attendance_notifications (
          id, company_id, operation_id, employee_id, notification_type, status,
          schedule_version, attempt_count, sent_at, twilio_message_sid, reminder_source
        )
        VALUES (
          @id, @companyId, @operationId, @employeeId, N'ATTENDANCE_CONFIRMATION_REMINDER', N'SENT',
          @scheduleVersion, 1, @sentAt, @sid, N'AUTOMATIC'
        )
      `);
    return notificationId;
  };

  it("Case A — open PENDING current version is eligible", async () => {
    const start = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const operationId = await insertOperation(start);
    const employeeId = await insertEmployee();
    const assignmentId = await insertAssignment(operationId, employeeId, "PENDING", 1, start);
    await insertSentReminder(operationId, employeeId, 1, new Date());

    const target = await attendanceNotificationRepository.findConfirmationReplyTarget(
      companyId,
      employeeId,
      new Date(),
    );

    assert.ok(target);
    assert.equal(target.kind, "eligible_pending");
    assert.equal(target.assignmentId.toLowerCase(), assignmentId.toLowerCase());
    assert.equal(target.scheduleVersion, 1);
  });

  it("Case B — onlyExpired returns expired_pending for current version", async () => {
    const start = new Date(Date.now() - 60 * 60 * 1000);
    const operationId = await insertOperation(start);
    const employeeId = await insertEmployee();
    const assignmentId = await insertAssignment(operationId, employeeId, "PENDING", 1, start);
    await insertSentReminder(operationId, employeeId, 1, new Date(Date.now() - 2 * 60 * 60 * 1000));

    const open = await attendanceNotificationRepository.findConfirmationReplyTarget(
      companyId,
      employeeId,
      new Date(),
    );
    assert.equal(open, null);

    const expired = await attendanceNotificationRepository.findConfirmationReplyTarget(
      companyId,
      employeeId,
      new Date(),
      { onlyExpired: true },
    );
    assert.ok(expired);
    assert.equal(expired.kind, "expired_pending");
    assert.equal(expired.assignmentId.toLowerCase(), assignmentId.toLowerCase());
  });

  it("Case C — old scheduleVersion reminder is ignored", async () => {
    const start = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const operationId = await insertOperation(start);
    const employeeId = await insertEmployee();
    await insertAssignment(operationId, employeeId, "PENDING", 2, start);
    await insertSentReminder(operationId, employeeId, 1, new Date());

    const target = await attendanceNotificationRepository.findConfirmationReplyTarget(
      companyId,
      employeeId,
      new Date(),
    );
    assert.equal(target, null);
  });

  it("Case D — prefers current scheduleVersion when V1 and V2 SENT", async () => {
    const start = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const operationId = await insertOperation(start);
    const employeeId = await insertEmployee();
    await insertAssignment(operationId, employeeId, "PENDING", 2, start);
    await insertSentReminder(operationId, employeeId, 1, new Date(Date.now() - 60_000));
    const v2NotificationId = await insertSentReminder(operationId, employeeId, 2, new Date());

    const target = await attendanceNotificationRepository.findConfirmationReplyTarget(
      companyId,
      employeeId,
      new Date(),
    );
    assert.ok(target);
    assert.equal(target.scheduleVersion, 2);
    assert.equal(target.notificationId.toLowerCase(), v2NotificationId.toLowerCase());
  });

  it("Case E/F — CANCELLED and COMPLETED operations are not targets", async () => {
    for (const status of ["CANCELLED", "COMPLETED"] as const) {
      const start = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const operationId = await insertOperation(start, status);
      const employeeId = await insertEmployee();
      await insertAssignment(operationId, employeeId, "PENDING", 1, start);
      await insertSentReminder(operationId, employeeId, 1, new Date());

      const target = await attendanceNotificationRepository.findConfirmationReplyTarget(
        companyId,
        employeeId,
        new Date(),
      );
      assert.equal(target, null, `expected null for ${status}`);
    }
  });

  it("Case G — historical PENDING past start does not open-window capture", async () => {
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const operationId = await insertOperation(start);
    const employeeId = await insertEmployee();
    await insertAssignment(operationId, employeeId, "PENDING", 1, start);
    await insertSentReminder(operationId, employeeId, 1, new Date(Date.now() - 25 * 60 * 60 * 1000));

    const target = await attendanceNotificationRepository.findConfirmationReplyTarget(
      companyId,
      employeeId,
      new Date(),
    );
    assert.equal(target, null);
  });

  it("Case H — two open assignments prefer latest sent_at PENDING", async () => {
    const employeeId = await insertEmployee();
    const startA = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const startB = new Date(Date.now() + 10 * 60 * 60 * 1000);
    const opA = await insertOperation(startA);
    const opB = await insertOperation(startB);
    const assignmentA = await insertAssignment(opA, employeeId, "PENDING", 1, startA);
    const assignmentB = await insertAssignment(opB, employeeId, "PENDING", 1, startB);
    await insertSentReminder(opA, employeeId, 1, new Date(Date.now() - 120_000));
    await insertSentReminder(opB, employeeId, 1, new Date(Date.now() - 30_000));

    const target = await attendanceNotificationRepository.findConfirmationReplyTarget(
      companyId,
      employeeId,
      new Date(),
    );
    assert.ok(target);
    assert.equal(target.assignmentId.toLowerCase(), assignmentB.toLowerCase());
    assert.notEqual(target.assignmentId.toLowerCase(), assignmentA.toLowerCase());
  });

  it("Case I — resolved CONFIRMED/UNAVAILABLE open window are returned", async () => {
    for (const status of ["CONFIRMED", "UNAVAILABLE"] as const) {
      const start = new Date(Date.now() + 7 * 60 * 60 * 1000);
      const operationId = await insertOperation(start);
      const employeeId = await insertEmployee();
      await insertAssignment(operationId, employeeId, status, 1, start);
      await insertSentReminder(operationId, employeeId, 1, new Date());

      const target = await attendanceNotificationRepository.findConfirmationReplyTarget(
        companyId,
        employeeId,
        new Date(),
      );
      assert.ok(target);
      assert.equal(
        target.kind,
        status === "CONFIRMED" ? "confirmed_open" : "unavailable_open",
      );
    }
  });
});
