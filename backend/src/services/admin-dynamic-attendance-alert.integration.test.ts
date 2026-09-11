/**
 * SQL integration: dynamic admin attendance alerts (selection + send-time gates).
 *
 * Temporal source of truth: SQL DATEADD on UTC DateTime2 for candidate selection;
 * TypeScript isDueWithinMaxLateness / minutesBetween for send-time (same inclusive window).
 *
 * Enable: RUN_DB_INTEGRATION_TESTS=true (+ DB_* / JWT_SECRET / FRONTEND_URL / TZ)
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, afterEach, it, mock } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { adminDynamicAttendanceAlertRepository } from "../repositories/admin-dynamic-attendance-alert.repository";
import { adminAlertNotificationRepository } from "../repositories/admin-alert-notification.repository";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { adminAlertDeliveryService } from "./admin-alert-delivery.service";
import { adminDynamicAttendanceAlertService } from "./admin-dynamic-attendance-alert.service";
import { twilioOutboundService } from "./twilio-outbound.service";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { insertOperationalLocationFixture } from "../test-helpers/operational-location-fixture";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const uniqueCompanyName = (): string =>
  `DynAdminAlert ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (seed: number): string =>
  `+54911${String(Date.now()).slice(-5)}${String(seed).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}`;

describeDatabaseIntegration("dynamic admin attendance alerts SQL", () => {
  const createdCompanyIds: string[] = [];
  let twilioCalls = 0;

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

  afterEach(async () => {
    mock.restoreAll();
    twilioCalls = 0;
    for (const companyId of createdCompanyIds) {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          UPDATE whatsapp_admin_alert_notifications
          SET status = N'CANCELLED',
              lease_owner = NULL,
              lease_expires_at = NULL,
              next_attempt_at = NULL,
              updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId
            AND status IN (N'PENDING', N'FAILED', N'PROCESSING', N'SEND_STARTED')
        `);
    }
  });

  const trackCompany = (companyId: string): void => {
    createdCompanyIds.push(companyId);
  };

  const backdateWindows = async (
    companyId: string,
    recipientId: string,
    daysAgo = 3,
  ): Promise<void> => {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("recipientId", sql.UniqueIdentifier, recipientId)
      .input("daysAgo", sql.Int, daysAgo)
      .query(`
        UPDATE company_settings
        SET admin_alerts_enabled_at = DATEADD(day, -@daysAgo, SYSUTCDATETIME())
        WHERE company_id = @companyId;

        UPDATE company_alert_recipients
        SET created_at = DATEADD(day, -@daysAgo, SYSUTCDATETIME())
        WHERE company_id = @companyId AND id = @recipientId;
      `);
  };

  const seedCompany = async (): Promise<{
    companyId: string;
    employeeId: string;
    employeeName: string;
    serviceId: string;
    recipientId: string;
  }> => {
    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Dyn Admin Owner",
        email: `dyn-admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    trackCompany(companyId);

    await companySettingsRepository.update(companyId, {
      adminAlertsEnabled: true,
      adminAttendanceConfirmationMissingEnabled: true,
      adminMissingCheckinEnabled: true,
      adminMissingCheckoutEnabled: true,
      adminConfirmationEscalationMinutes: 60,
      adminMissingCheckoutDelayMinutes: 30,
      adminAlertMaxLatenessMinutes: 120,
    });

    const serviceId = await insertOperationalLocationFixture({
      companyId,
      name: "Dyn Loc",
      latitude: -34.6,
      longitude: -58.4,
      address: "Calle 1",
    });
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, serviceId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE operational_locations
        SET locality = N'CABA'
        WHERE id = @id AND company_id = @companyId
      `);

    const employeeName = "Empleado Dyn";
    const employee = await employeeRepository.create(companyId, {
      name: employeeName,
      phoneNumber: uniquePhone(1),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });

    const recipient = await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: uniquePhone(2),
      displayName: "Admin Dyn",
      isEnabled: true,
      receiveOperationalAlerts: true,
      receiveRequestAlerts: false,
      receiveSecurityAlerts: false,
    });

    await backdateWindows(companyId, recipient.id);

    return {
      companyId,
      employeeId: employee.id,
      employeeName,
      serviceId,
      recipientId: recipient.id,
    };
  };

  const insertPendingConfirmation = async (input: {
    companyId: string;
    serviceId: string;
    employeeId: string;
    /** Minutes until scheduled_start from referenceAt. dueAt = start - 60. */
    minutesUntilStart: number;
    referenceAt: Date;
    status?: string;
    scheduleVersion?: number;
  }): Promise<{ operationId: string; assignmentId: string; dueAt: Date }> => {
    const scheduledStart = new Date(
      input.referenceAt.getTime() + input.minutesUntilStart * 60_000,
    );
    const scheduledEnd = new Date(scheduledStart.getTime() + 4 * 60 * 60 * 1000);
    const workDate = scheduledStart.toISOString().slice(0, 10);
    const dueAt = new Date(scheduledStart.getTime() - 60 * 60_000);

    const operationInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("serviceId", sql.UniqueIdentifier, input.serviceId)
      .input("scheduledStart", sql.DateTime2, scheduledStart)
      .input("scheduledEnd", sql.DateTime2, scheduledEnd)
      .input("status", sql.NVarChar(30), input.status ?? "SCHEDULED")
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          60, 15, @status
        )
      `);
    const operationId = String(operationInsert.recordset[0].id);

    const assignmentInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("workDate", sql.Date, workDate)
      .input("scheduleVersion", sql.Int, input.scheduleVersion ?? 1)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until,
          confirmation_status, confirmation_schedule_version
        )
        OUTPUT INSERTED.id
        VALUES (
          NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate,
          N'PENDING', @scheduleVersion
        )
      `);

    return {
      operationId,
      assignmentId: String(assignmentInsert.recordset[0].id),
      dueAt,
    };
  };

  const insertActiveWorkday = async (input: {
    companyId: string;
    serviceId: string;
    employeeId: string;
    expectedStart: Date;
    expectedEnd: Date;
    lateToleranceMinutes?: number;
    confirmationStatus?: string;
    withCheckin?: boolean;
    withCheckout?: boolean;
    overnight?: boolean;
  }): Promise<{
    operationId: string;
    assignmentId: string;
    employeeWorkdayId: string;
    checkinDueAt: Date;
    checkoutDueAt: Date;
  }> => {
    const workDate = input.expectedStart.toISOString().slice(0, 10);
    const lateTolerance = input.lateToleranceMinutes ?? 15;

    const operationInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("serviceId", sql.UniqueIdentifier, input.serviceId)
      .input("scheduledStart", sql.DateTime2, input.expectedStart)
      .input("scheduledEnd", sql.DateTime2, input.expectedEnd)
      .input("lateTolerance", sql.Int, lateTolerance)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          60, @lateTolerance, N'IN_PROGRESS'
        )
      `);
    const operationId = String(operationInsert.recordset[0].id);

    const owInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .input("expectedStart", sql.DateTime2, input.expectedStart)
      .input("expectedEnd", sql.DateTime2, input.expectedEnd)
      .input("lateTolerance", sql.Int, lateTolerance)
      .query(`
        INSERT INTO operation_workdays (
          id, company_id, operation_id, work_date, status,
          expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version
        )
        OUTPUT INSERTED.id
        VALUES (
          NEWID(), @companyId, @operationId, @workDate, N'ACTIVE',
          @expectedStart, @expectedEnd,
          60, @lateTolerance, 1
        )
      `);
    const operationWorkdayId = String(owInsert.recordset[0].id);

    const assignmentInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("workDate", sql.Date, workDate)
      .input("status", sql.NVarChar(30), input.confirmationStatus ?? "CONFIRMED")
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until,
          confirmation_status, confirmation_schedule_version
        )
        OUTPUT INSERTED.id
        VALUES (
          NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate,
          @status, 1
        )
      `);
    const assignmentId = String(assignmentInsert.recordset[0].id);

    const ewInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        INSERT INTO employee_workdays (
          id, company_id, operation_workday_id, employee_id, operation_assignment_id,
          expectation_status
        )
        OUTPUT INSERTED.id
        VALUES (
          NEWID(), @companyId, @operationWorkdayId, @employeeId, @assignmentId,
          N'EXPECTED'
        )
      `);
    const employeeWorkdayId = String(ewInsert.recordset[0].id);

    if (input.withCheckin) {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("operationId", sql.UniqueIdentifier, operationId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
        .input("receivedAt", sql.DateTime2, input.expectedStart)
        .input(
          "checkoutAt",
          sql.DateTime2,
          input.withCheckout ? input.expectedEnd : null,
        )
        .query(`
          INSERT INTO attendance_records (
            company_id, operation_id, employee_id, employee_workday_id,
            received_latitude, received_longitude, distance_meters,
            validation_status, location_status, punctuality_status,
            received_at, checkout_at, is_simulation
          )
          VALUES (
            @companyId, @operationId, @employeeId, @employeeWorkdayId,
            -34.6037, -58.3816, 10,
            N'VALID', N'INSIDE_GEOFENCE', N'ON_TIME',
            @receivedAt, @checkoutAt, 0
          )
        `);
    }

    return {
      operationId,
      assignmentId,
      employeeWorkdayId,
      checkinDueAt: new Date(input.expectedStart.getTime() + lateTolerance * 60_000),
      checkoutDueAt: new Date(input.expectedEnd.getTime() + 30 * 60_000),
    };
  };

  const mockTwilio = (): void => {
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => {
      twilioCalls += 1;
      return { messageSid: `SM${randomUUID().replace(/-/g, "").slice(0, 32)}` };
    });
  };

  const countOutbox = async (
    companyId: string,
    alertType: string,
    status?: string,
  ): Promise<number> => {
    const req = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("alertType", sql.NVarChar(80), alertType);
    if (status) {
      req.input("status", sql.NVarChar(30), status);
    }
    const result = await req.query(`
      SELECT COUNT(1) AS c
      FROM whatsapp_admin_alert_notifications
      WHERE company_id = @companyId
        AND alert_type = @alertType
        ${status ? "AND status = @status" : ""}
    `);
    return Number(result.recordset[0].c);
  };

  it("selects pending confirmation within max lateness and persists due_at + assignment_id", async () => {
    const seed = await seedCompany();
    const referenceAt = new Date("2026-09-12T12:00:00.000Z");
    // dueAt = start - 60 = referenceAt → minutesUntilStart = 60
    const pending = await insertPendingConfirmation({
      ...seed,
      minutesUntilStart: 60,
      referenceAt,
    });

    const obligations =
      await adminDynamicAttendanceAlertRepository.listConfirmationMissingObligations(
        referenceAt,
        25,
      );
    const match = obligations.filter((o) => o.companyId === seed.companyId);
    assert.equal(match.length, 1);
    assert.equal(match[0]?.assignmentId, pending.assignmentId);
    assert.ok(match[0]?.dueAt);

    const result = await adminDynamicAttendanceAlertService.reconcileDue(referenceAt, {
      batchSize: 25,
    });
    assert.ok(result.confirmationEnqueued >= 1);

    const row = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, seed.companyId)
      .query(`
        SELECT TOP 1 due_at, assignment_id, employee_workday_id, status, alert_type
        FROM whatsapp_admin_alert_notifications
        WHERE company_id = @companyId
          AND alert_type = N'ATTENDANCE_CONFIRMATION_MISSING'
      `);
    assert.equal(row.recordset.length, 1);
    assert.ok(row.recordset[0].due_at);
    assert.ok(row.recordset[0].assignment_id);
    assert.equal(row.recordset[0].status, "PENDING");
  });

  it("excludes confirmation when JUSTIFIED workday exists", async () => {
    const seed = await seedCompany();
    const referenceAt = new Date("2026-09-12T12:00:00.000Z");
    const pending = await insertPendingConfirmation({
      ...seed,
      minutesUntilStart: 60,
      referenceAt,
    });

    const workDate = new Date(pending.dueAt.getTime() + 60 * 60_000)
      .toISOString()
      .slice(0, 10);
    const ow = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, seed.companyId)
      .input("operationId", sql.UniqueIdentifier, pending.operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO operation_workdays (
          id, company_id, operation_id, work_date, status,
          expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version
        )
        OUTPUT INSERTED.id
        VALUES (
          NEWID(), @companyId, @operationId, @workDate, N'ACTIVE',
          DATEADD(HOUR, 1, SYSUTCDATETIME()), DATEADD(HOUR, 5, SYSUTCDATETIME()),
          60, 15, 1
        )
      `);
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, seed.companyId)
      .input("owId", sql.UniqueIdentifier, String(ow.recordset[0].id))
      .input("employeeId", sql.UniqueIdentifier, seed.employeeId)
      .input("assignmentId", sql.UniqueIdentifier, pending.assignmentId)
      .query(`
        INSERT INTO employee_workdays (
          id, company_id, operation_workday_id, employee_id, operation_assignment_id,
          expectation_status
        )
        VALUES (
          NEWID(), @companyId, @owId, @employeeId, @assignmentId, N'JUSTIFIED'
        )
      `);

    const obligations =
      await adminDynamicAttendanceAlertRepository.listConfirmationMissingObligations(
        referenceAt,
        25,
      );
    assert.equal(
      obligations.filter((o) => o.companyId === seed.companyId).length,
      0,
    );
  });

  it("skips Twilio and marks EXPIRED when max lateness exceeded at send", async () => {
    const seed = await seedCompany();
    mockTwilio();
    const referenceAt = new Date("2026-09-12T12:00:00.000Z");
    const pending = await insertPendingConfirmation({
      ...seed,
      minutesUntilStart: 60,
      referenceAt,
    });

    await adminDynamicAttendanceAlertService.reconcileDue(referenceAt, { batchSize: 25 });

    // Age the due_at past max lateness (120m)
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, seed.companyId)
      .input("dueAt", sql.DateTime2, new Date(referenceAt.getTime() - 200 * 60_000))
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET due_at = @dueAt, occurred_at = @dueAt
        WHERE company_id = @companyId
          AND alert_type = N'ATTENDANCE_CONFIRMATION_MISSING'
      `);

    const delivery = await adminAlertDeliveryService.processPendingBatch(50, {
      now: referenceAt,
    });
    assert.equal(twilioCalls, 0);
    assert.ok(delivery.skipped >= 1);
    assert.equal(
      await countOutbox(seed.companyId, "ATTENDANCE_CONFIRMATION_MISSING", "EXPIRED"),
      1,
    );
    assert.ok(pending.assignmentId);
  });

  it("marks SKIPPED_DISABLED when master flag disabled after enqueue", async () => {
    const seed = await seedCompany();
    mockTwilio();
    const referenceAt = new Date("2026-09-12T12:00:00.000Z");
    await insertPendingConfirmation({
      ...seed,
      minutesUntilStart: 60,
      referenceAt,
    });
    await adminDynamicAttendanceAlertService.reconcileDue(referenceAt, { batchSize: 25 });

    await companySettingsRepository.update(seed.companyId, {
      adminAlertsEnabled: false,
    });

    await adminAlertDeliveryService.processPendingBatch(50, { now: referenceAt });
    assert.equal(twilioCalls, 0);
    assert.equal(
      await countOutbox(
        seed.companyId,
        "ATTENDANCE_CONFIRMATION_MISSING",
        "SKIPPED_DISABLED",
      ),
      1,
    );
  });

  it("marks SKIPPED_DISABLED when type flag disabled after enqueue", async () => {
    const seed = await seedCompany();
    mockTwilio();
    const referenceAt = new Date("2026-09-12T12:00:00.000Z");
    await insertPendingConfirmation({
      ...seed,
      minutesUntilStart: 60,
      referenceAt,
    });
    await adminDynamicAttendanceAlertService.reconcileDue(referenceAt, { batchSize: 25 });

    await companySettingsRepository.update(seed.companyId, {
      adminAttendanceConfirmationMissingEnabled: false,
    });

    await adminAlertDeliveryService.processPendingBatch(50, { now: referenceAt });
    assert.equal(twilioCalls, 0);
    assert.equal(
      await countOutbox(
        seed.companyId,
        "ATTENDANCE_CONFIRMATION_MISSING",
        "SKIPPED_DISABLED",
      ),
      1,
    );
  });

  it("resolves confirmation before send when operation completed", async () => {
    const seed = await seedCompany();
    mockTwilio();
    const referenceAt = new Date("2026-09-12T12:00:00.000Z");
    const pending = await insertPendingConfirmation({
      ...seed,
      minutesUntilStart: 60,
      referenceAt,
    });
    await adminDynamicAttendanceAlertService.reconcileDue(referenceAt, { batchSize: 25 });

    await getPool()
      .request()
      .input("operationId", sql.UniqueIdentifier, pending.operationId)
      .query(`UPDATE scheduled_operations SET status = N'COMPLETED' WHERE id = @operationId`);

    await adminAlertDeliveryService.processPendingBatch(50, { now: referenceAt });
    assert.equal(twilioCalls, 0);
    assert.equal(
      await countOutbox(seed.companyId, "ATTENDANCE_CONFIRMATION_MISSING", "SKIPPED"),
      1,
    );
  });

  it("selects missing check-in after start and skips Twilio when check-in arrives before send", async () => {
    const seed = await seedCompany();
    mockTwilio();
    const referenceAt = new Date("2026-09-12T12:00:00.000Z");
    const expectedStart = new Date(referenceAt.getTime() - 30 * 60_000);
    const expectedEnd = new Date(expectedStart.getTime() + 4 * 60 * 60 * 1000);
    const workday = await insertActiveWorkday({
      ...seed,
      expectedStart,
      expectedEnd,
      lateToleranceMinutes: 15,
    });

    const listed =
      await adminDynamicAttendanceAlertRepository.listMissingCheckinAfterStartObligations(
        referenceAt,
        25,
      );
    assert.ok(listed.some((o) => o.employeeWorkdayId === workday.employeeWorkdayId));

    await adminDynamicAttendanceAlertService.reconcileDue(referenceAt, { batchSize: 25 });

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, seed.companyId)
      .input("operationId", sql.UniqueIdentifier, workday.operationId)
      .input("employeeId", sql.UniqueIdentifier, seed.employeeId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, workday.employeeWorkdayId)
      .input("receivedAt", sql.DateTime2, expectedStart)
      .query(`
        INSERT INTO attendance_records (
          company_id, operation_id, employee_id, employee_workday_id,
          received_latitude, received_longitude, distance_meters,
          validation_status, location_status, punctuality_status,
          received_at, is_simulation
        )
        VALUES (
          @companyId, @operationId, @employeeId, @employeeWorkdayId,
          -34.6037, -58.3816, 10,
          N'VALID', N'INSIDE_GEOFENCE', N'ON_TIME',
          @receivedAt, 0
        )
      `);

    await adminAlertDeliveryService.processPendingBatch(50, { now: referenceAt });
    assert.equal(twilioCalls, 0);
    assert.equal(
      await countOutbox(seed.companyId, "MISSING_CHECKIN_AFTER_START", "SKIPPED"),
      1,
    );
  });

  it("selects missing checkout after end for overnight 20:30→03:00 window", async () => {
    const seed = await seedCompany();
    // Overnight: start previous evening, end at 03:00 UTC, delay 30 → due 03:30
    const expectedStart = new Date("2026-09-11T23:30:00.000Z"); // 20:30 ART
    const expectedEnd = new Date("2026-09-12T06:00:00.000Z"); // 03:00 ART
    const referenceAt = new Date("2026-09-12T06:35:00.000Z");
    const workday = await insertActiveWorkday({
      ...seed,
      expectedStart,
      expectedEnd,
      withCheckin: true,
      overnight: true,
    });

    const listed =
      await adminDynamicAttendanceAlertRepository.listMissingCheckoutAfterEndObligations(
        referenceAt,
        25,
      );
    const match = listed.filter((o) => o.employeeWorkdayId === workday.employeeWorkdayId);
    assert.equal(match.length, 1);
    assert.ok(match[0]?.dueAt);
    assert.equal(match[0]?.employeeWorkdayId, workday.employeeWorkdayId);
  });

  it("materializes EXPIRED confirmation past max lateness idempotently", async () => {
    const seed = await seedCompany();
    const referenceAt = new Date("2026-09-12T12:00:00.000Z");
    // dueAt = start-60; want dueAt ~ 200 minutes before reference → minutesUntilStart = -140
    await insertPendingConfirmation({
      ...seed,
      minutesUntilStart: -140,
      referenceAt,
    });

    const first = await adminDynamicAttendanceAlertService.reconcileDue(referenceAt, {
      batchSize: 25,
    });
    assert.ok(first.expired >= 1);
    const second = await adminDynamicAttendanceAlertService.reconcileDue(referenceAt, {
      batchSize: 25,
    });
    assert.equal(second.expired, 0);
    assert.equal(
      await countOutbox(seed.companyId, "ATTENDANCE_CONFIRMATION_MISSING", "EXPIRED"),
      1,
    );
  });

  it("does not duplicate outbox rows for same recipient+dedup key", async () => {
    const seed = await seedCompany();
    const referenceAt = new Date("2026-09-12T12:00:00.000Z");
    await insertPendingConfirmation({
      ...seed,
      minutesUntilStart: 60,
      referenceAt,
    });

    await adminDynamicAttendanceAlertService.reconcileDue(referenceAt, { batchSize: 25 });
    await adminDynamicAttendanceAlertService.reconcileDue(referenceAt, { batchSize: 25 });
    assert.equal(await countOutbox(seed.companyId, "ATTENDANCE_CONFIRMATION_MISSING"), 1);
  });

  it("send-time gate returns ELIGIBLE for structured assignment identity", async () => {
    const seed = await seedCompany();
    const referenceAt = new Date("2026-09-12T12:00:00.000Z");
    const pending = await insertPendingConfirmation({
      ...seed,
      minutesUntilStart: 60,
      referenceAt,
    });

    const gate = await adminDynamicAttendanceAlertRepository.getDynamicAlertSendGate(
      seed.companyId,
      "ATTENDANCE_CONFIRMATION_MISSING",
      {
        operationId: pending.operationId,
        employeeId: seed.employeeId,
        assignmentId: pending.assignmentId,
        employeeWorkdayId: null,
        deduplicationKey: `confirmation-missing:${pending.assignmentId}:1`,
      },
    );
    assert.equal(gate, "ELIGIBLE");
  });

  it("legacy missing-checkin adapter does not create MISSING_CHECKIN_AFTER_OPERATION WhatsApp", async () => {
    const { adminAlertMissingCheckinService } = await import(
      "./admin-alert-missing-checkin.service"
    );
    const seed = await seedCompany();
    await adminAlertMissingCheckinService.emitForCompletedOperation(seed.companyId, {
      id: randomUUID(),
      companyId: seed.companyId,
      status: "COMPLETED",
      operationKind: "ONE_TIME",
    } as never);
    assert.equal(
      await countOutbox(seed.companyId, "MISSING_CHECKIN_AFTER_OPERATION"),
      0,
    );
  });
});
