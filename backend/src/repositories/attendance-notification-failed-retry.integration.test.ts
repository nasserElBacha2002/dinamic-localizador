/**
 * Attendance notification FAILED / SUPERSEDED retry lifecycle against SQL Server.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import {
  ATTENDANCE_REMINDER_MAX_ATTEMPTS,
} from "../constants/attendance-notification";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { attendanceNotificationRepository } from "./attendance-notification.repository";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("attendance notification FAILED retry lifecycle (SQL)", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let serviceId = "";
  let confirmationHoursBefore = 24;
  let caseSuffix = 0;

  before(async () => {
    await setupDatabaseIntegration();
    const pool = getPool();

    const company = await pool.request().query(`
      SELECT TOP 1 id
      FROM companies
      WHERE status = N'ACTIVE' OR status IS NULL
      ORDER BY
        CASE WHEN name = N'Dinamic Systems' THEN 0 ELSE 1 END,
        created_at ASC
    `);
    companyId = String(company.recordset[0]?.id ?? "");
    assert.ok(companyId, "ACTIVE company required");

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE company_settings
        SET confirmation_reminder_enabled = 1,
            confirmation_reminder_hours_before = COALESCE(confirmation_reminder_hours_before, 24)
        WHERE company_id = @companyId
      `);

    const settings = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT confirmation_reminder_hours_before
        FROM company_settings
        WHERE company_id = @companyId
      `);
    confirmationHoursBefore = Number(settings.recordset[0]?.confirmation_reminder_hours_before ?? 24);

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId, "active operational_location required");
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const createEligibleFixture = async (): Promise<{
    operationId: string;
    employeeId: string;
    scheduleVersion: number;
    referenceAt: Date;
  }> => {
    caseSuffix += 1;
    const pool = getPool();
    // Inside confirmation window: start in the future, but already past (start - hoursBefore).
    const hoursUntilStart = Math.max(1, Math.floor(confirmationHoursBefore / 2));
    const scheduledStart = new Date(Date.now() + hoursUntilStart * 60 * 60 * 1000);
    const scheduledEnd = new Date(scheduledStart.getTime() + 4 * 60 * 60 * 1000);
    const referenceAt = new Date();

    const op = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, scheduledStart)
      .input("scheduledEnd", sql.DateTime2, scheduledEnd)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          15, 15, N'SCHEDULED'
        )
      `);
    const operationId = String(op.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const phone = uniquePhone(caseSuffix);
    const emp = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `Failed Retry Emp ${caseSuffix}`)
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(emp.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    const scheduleVersion = 1;
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, scheduledStart.toISOString().slice(0, 10))
      .input("scheduleVersion", sql.Int, scheduleVersion)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until,
          confirmation_status, confirmation_schedule_version
        )
        VALUES (
          NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate,
          N'PENDING', @scheduleVersion
        )
      `);

    return { operationId, employeeId, scheduleVersion, referenceAt };
  };

  const insertNotification = async (input: {
    operationId: string;
    employeeId: string;
    scheduleVersion: number;
    status: "FAILED" | "SUPERSEDED" | "SENT" | "PENDING";
    attemptCount: number;
    errorMessage?: string;
  }): Promise<string> => {
    const pool = getPool();
    const id = randomUUID();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("status", sql.NVarChar(40), input.status)
      .input("attemptCount", sql.Int, input.attemptCount)
      .input("scheduleVersion", sql.Int, input.scheduleVersion)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage ?? null)
      .query(`
        INSERT INTO whatsapp_attendance_notifications (
          id, company_id, operation_id, employee_id, notification_type, status,
          attempt_count, schedule_version, reminder_source, error_message, last_attempt_at
        )
        VALUES (
          @id, @companyId, @operationId, @employeeId, N'ATTENDANCE_CONFIRMATION_REMINDER', @status,
          @attemptCount, @scheduleVersion, N'AUTOMATIC', @errorMessage, SYSUTCDATETIME()
        )
      `);
    return id;
  };

  const countMatchingCandidates = async (
    operationId: string,
    employeeId: string,
    referenceAt: Date,
  ): Promise<number> => {
    const candidates = await attendanceNotificationRepository.findConfirmationReminderCandidates(
      companyId,
      referenceAt,
    );
    return candidates.filter(
      (c) => c.operationId === operationId && c.employeeId === employeeId,
    ).length;
  };

  const readNotification = async (notificationId: string) => {
    const pool = getPool();
    const row = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, notificationId)
      .query(`
        SELECT id, status, attempt_count, twilio_message_sid
        FROM whatsapp_attendance_notifications
        WHERE company_id = @companyId AND id = @id
      `);
    return row.recordset[0] as {
      id: string;
      status: string;
      attempt_count: number;
      twilio_message_sid: string | null;
    };
  };

  it("FAILED attempt_count=1 is discovered and claim/reclaim increments attempt", async () => {
    assert.equal(ATTENDANCE_REMINDER_MAX_ATTEMPTS, 3);
    const fixture = await createEligibleFixture();
    const notificationId = await insertNotification({
      ...fixture,
      status: "FAILED",
      attemptCount: 1,
      errorMessage: "CONFIRMATION_BLOCKED_BY_ACTIVE_SESSION_CONFLICT",
    });

    assert.equal(
      await countMatchingCandidates(fixture.operationId, fixture.employeeId, fixture.referenceAt),
      1,
      "FAILED under attempt budget must appear in candidate discovery",
    );

    const claimed = await attendanceNotificationRepository.claimNotificationForAttempt(companyId, {
      operationId: fixture.operationId,
      employeeId: fixture.employeeId,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
      scheduleVersion: fixture.scheduleVersion,
    });

    assert.ok(claimed, "claim/reclaim must succeed for FAILED attempt_count=1");
    assert.equal(claimed.id.toLowerCase(), notificationId.toLowerCase());
    assert.equal(claimed.status, "PENDING");
    assert.equal(claimed.attemptCount, 2);

    const persisted = await readNotification(notificationId);
    assert.equal(String(persisted.status), "PENDING");
    assert.equal(Number(persisted.attempt_count), 2);
  });

  it("FAILED at ATTENDANCE_REMINDER_MAX_ATTEMPTS is not discovered and not claimed", async () => {
    const fixture = await createEligibleFixture();
    const notificationId = await insertNotification({
      ...fixture,
      status: "FAILED",
      attemptCount: ATTENDANCE_REMINDER_MAX_ATTEMPTS,
      errorMessage: "CONFIRMATION_BLOCKED_BY_ACTIVE_SESSION_CONFLICT",
    });

    assert.equal(
      await countMatchingCandidates(fixture.operationId, fixture.employeeId, fixture.referenceAt),
      0,
      "FAILED at max attempts must not be a candidate",
    );

    const claimed = await attendanceNotificationRepository.claimNotificationForAttempt(companyId, {
      operationId: fixture.operationId,
      employeeId: fixture.employeeId,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
      scheduleVersion: fixture.scheduleVersion,
    });
    assert.equal(claimed, null);

    const persisted = await readNotification(notificationId);
    assert.equal(String(persisted.status), "FAILED");
    assert.equal(Number(persisted.attempt_count), ATTENDANCE_REMINDER_MAX_ATTEMPTS);
  });

  it("SUPERSEDED is never discovered or reclaimed", async () => {
    const fixture = await createEligibleFixture();
    const notificationId = await insertNotification({
      ...fixture,
      status: "SUPERSEDED",
      attemptCount: 1,
      errorMessage: "NO_LONGER_ELIGIBLE_FOR_CONFIRMATION_ALREADY_CHECKED_IN",
    });

    assert.equal(
      await countMatchingCandidates(fixture.operationId, fixture.employeeId, fixture.referenceAt),
      0,
    );

    const claimed = await attendanceNotificationRepository.claimNotificationForAttempt(companyId, {
      operationId: fixture.operationId,
      employeeId: fixture.employeeId,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
      scheduleVersion: fixture.scheduleVersion,
    });
    assert.equal(claimed, null);

    const persisted = await readNotification(notificationId);
    assert.equal(String(persisted.status), "SUPERSEDED");
    assert.equal(Number(persisted.attempt_count), 1);
  });

  it("FAILED attempt=1 reclaim then markSent ends as single SENT row", async () => {
    const fixture = await createEligibleFixture();
    const notificationId = await insertNotification({
      ...fixture,
      status: "FAILED",
      attemptCount: 1,
      errorMessage: "CONFIRMATION_BLOCKED_BY_ACTIVE_SESSION_CONFLICT",
    });

    const claimed = await attendanceNotificationRepository.claimNotificationForAttempt(companyId, {
      operationId: fixture.operationId,
      employeeId: fixture.employeeId,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
      scheduleVersion: fixture.scheduleVersion,
    });
    assert.ok(claimed);
    assert.equal(claimed.id.toLowerCase(), notificationId.toLowerCase());

    await attendanceNotificationRepository.markSent(companyId, {
      notificationId: claimed.id,
      twilioMessageSid: `SM_RETRY_${caseSuffix}`,
      sentAt: new Date(),
    });

    const persisted = await readNotification(notificationId);
    assert.equal(String(persisted.status), "SENT");
    assert.ok(persisted.twilio_message_sid);

    const pool = getPool();
    const count = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, fixture.operationId)
      .input("employeeId", sql.UniqueIdentifier, fixture.employeeId)
      .query(`
        SELECT COUNT(*) AS total
        FROM whatsapp_attendance_notifications
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND employee_id = @employeeId
          AND notification_type = N'ATTENDANCE_CONFIRMATION_REMINDER'
          AND schedule_version = 1
      `);
    assert.equal(Number(count.recordset[0].total), 1, "must not create a duplicate notification");

    // SENT must not reclaim again.
    const secondClaim = await attendanceNotificationRepository.claimNotificationForAttempt(
      companyId,
      {
        operationId: fixture.operationId,
        employeeId: fixture.employeeId,
        notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
        scheduleVersion: fixture.scheduleVersion,
      },
    );
    assert.equal(secondClaim, null);
  });
});
