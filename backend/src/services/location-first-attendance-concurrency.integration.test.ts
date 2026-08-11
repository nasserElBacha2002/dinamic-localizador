/**
 * Real SQL concurrency + MessageSid idempotency for location-first attendance.
 * Enable with RUN_DB_INTEGRATION_TESTS=true and required DB env vars.
 *
 * DB invariants exercised (no new migration — already present):
 * - UX_attendance_records_employee_workday_active_real
 * - UQ_attendance_records_source_message_sid
 * - registerCheckoutInTransaction CAS (checkout_at IS NULL)
 * - claimInboundMessage MessageSid idempotency
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import {
  hashWebhookPayload,
  whatsappWebhookEventRepository,
} from "../repositories/whatsapp-webhook-event.repository";
import { attendanceRepository } from "../repositories/attendance.repository";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";

describeDatabaseIntegration("location-first attendance SQL concurrency", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let serviceId = "";
  let employeeId = "";
  let operationId = "";
  let employeeWorkdayId = "";

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
        SELECT TOP 1 id, latitude, longitude, allowed_radius_meters
        FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    serviceId = String(serviceResult.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const phone = `+54911${String(Date.now()).slice(-8)}`;
    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `LocFirst Conc ${randomUUID().slice(0, 8)}`)
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    const start = new Date();
    start.setUTCMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
    const workDate = start.toISOString().slice(0, 10);

    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          120, 120, 'SCHEDULED'
        )
      `);
    operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const workdayInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @operationId, CAST(@scheduledStart AS DATE),
          @scheduledStart, @scheduledEnd, 120, 120, 1, 'ACTIVE'
        )
      `);
    const operationWorkdayId = String(workdayInsert.recordset[0].id);

    const assignmentInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until
        )
        OUTPUT INSERTED.id
        VALUES (NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate)
      `);
    const assignmentId = String(assignmentInsert.recordset[0].id);

    const ewInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        INSERT INTO employee_workdays (
          company_id, operation_workday_id, employee_id, operation_assignment_id, expectation_status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @operationWorkdayId, @employeeId, @assignmentId, N'EXPECTED'
        )
      `);
    employeeWorkdayId = String(ewInsert.recordset[0].id);
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("two concurrent LOCATION MessageSids cannot create two active check-ins", async () => {
    const sidA = `SM-conc-A-${randomUUID()}`;
    const sidB = `SM-conc-B-${randomUUID()}`;
    const receivedAt = new Date().toISOString();

    const results = await Promise.allSettled([
      attendanceRepository.create(companyId, {
        operationId,
        employeeId,
        employeeWorkdayId,
        receivedLatitude: -34.6,
        receivedLongitude: -58.4,
        distanceMeters: 10,
        validationStatus: "VALID",
        locationStatus: "INSIDE_GEOFENCE",
        punctualityStatus: "ON_TIME",
        sourceMessageSid: sidA,
        validationReason: null,
        receivedAt,
      }),
      attendanceRepository.create(companyId, {
        operationId,
        employeeId,
        employeeWorkdayId,
        receivedLatitude: -34.6,
        receivedLongitude: -58.4,
        distanceMeters: 12,
        validationStatus: "VALID",
        locationStatus: "INSIDE_GEOFENCE",
        punctualityStatus: "ON_TIME",
        sourceMessageSid: sidB,
        validationReason: null,
        receivedAt,
      }),
    ]);

    const fulfilled = results.filter((row) => row.status === "fulfilled");
    const rejected = results.filter((row) => row.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.match(
      String((rejected[0] as PromiseRejectedResult).reason),
      /UX_attendance_records_(employee_workday|inventory_employee)_active/i,
    );

    const rows = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        SELECT id, checkout_at, source_message_sid
        FROM attendance_records
        WHERE company_id = @companyId
          AND employee_workday_id = @employeeWorkdayId
          AND is_simulation = 0
      `);

    assert.equal(rows.recordset.length, 1);
    assert.equal(rows.recordset[0].checkout_at, null);
  });

  it("same MessageSid claim is idempotent and does not open a second processing lane", async () => {
    const messageSid = `SM-retry-${randomUUID()}`;
    const payloadHash = hashWebhookPayload({ MessageSid: messageSid, Body: "LOCATION" });

    const first = await whatsappWebhookEventRepository.claimInboundMessage({
      companyId,
      messageSid,
      payloadHash,
    });
    assert.equal(first.outcome, "CLAIMED");

    await whatsappWebhookEventRepository.markProcessed({
      companyId,
      eventId: first.event.id,
      processingVersion: first.event.processingVersion,
      responseBody: "ok-check-in",
      responseType: "TwiML",
      responseReference: "CHECKIN_COMPLETED",
    });

    const retry = await whatsappWebhookEventRepository.claimInboundMessage({
      companyId,
      messageSid,
      payloadHash,
    });
    assert.equal(retry.outcome, "IDEMPOTENT_REPLAY");
  });

  it("duplicate source_message_sid cannot insert a second attendance row", async () => {
    const messageSid = `SM-dup-src-${randomUUID()}`;
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    start.setUTCHours(12, 0, 0, 0);
    const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
    const pool = getPool();

    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          60, 60, 'SCHEDULED'
        )
      `);
    const opId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, opId);
    const workDate = start.toISOString().slice(0, 10);

    const workdayInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, opId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @operationId, CAST(@scheduledStart AS DATE),
          @scheduledStart, @scheduledEnd, 60, 60, 1, 'ACTIVE'
        )
      `);
    const owId = String(workdayInsert.recordset[0].id);

    const assignmentInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, opId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until
        )
        OUTPUT INSERTED.id
        VALUES (NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate)
      `);

    const ewInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, owId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentInsert.recordset[0].id)
      .query(`
        INSERT INTO employee_workdays (
          company_id, operation_workday_id, employee_id, operation_assignment_id, expectation_status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @operationWorkdayId, @employeeId, @assignmentId, N'EXPECTED'
        )
      `);
    const ewId = String(ewInsert.recordset[0].id);
    const receivedAt = start.toISOString();

    await attendanceRepository.create(companyId, {
      operationId: opId,
      employeeId,
      employeeWorkdayId: ewId,
      receivedLatitude: -34.6,
      receivedLongitude: -58.4,
      distanceMeters: 5,
      validationStatus: "VALID",
      locationStatus: "INSIDE_GEOFENCE",
      punctualityStatus: "ON_TIME",
      sourceMessageSid: messageSid,
      validationReason: null,
      receivedAt,
    });

    await assert.rejects(
      () =>
        attendanceRepository.create(companyId, {
          operationId: opId,
          employeeId,
          employeeWorkdayId: ewId,
          receivedLatitude: -34.6,
          receivedLongitude: -58.4,
          distanceMeters: 5,
          validationStatus: "VALID",
          locationStatus: "INSIDE_GEOFENCE",
          punctualityStatus: "ON_TIME",
          sourceMessageSid: messageSid,
          validationReason: null,
          receivedAt,
        }),
      /UQ_attendance_records_source_message_sid/i,
    );

    const rows = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, ewId)
      .query(`
        SELECT COUNT(*) AS cnt, SUM(CASE WHEN checkout_at IS NULL THEN 1 ELSE 0 END) AS open_cnt
        FROM attendance_records
        WHERE company_id = @companyId AND employee_workday_id = @employeeWorkdayId
      `);
    assert.equal(Number(rows.recordset[0].cnt), 1);
    assert.equal(Number(rows.recordset[0].open_cnt), 1);
  });

  it("concurrent checkouts on same attendance leave a single checkout_at", async () => {
    const pool = getPool();
    const existing = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        SELECT TOP 1 id
        FROM attendance_records
        WHERE company_id = @companyId
          AND employee_workday_id = @employeeWorkdayId
          AND checkout_at IS NULL
      `);
    const attendanceId = String(existing.recordset[0]?.id ?? "");
    assert.ok(attendanceId, "expected open attendance from concurrent check-in test");

    const runCheckout = async (sid: string) => {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const updated = await attendanceRepository.registerCheckoutInTransaction(
          companyId,
          transaction,
          {
            attendanceId,
            checkoutLatitude: -34.6,
            checkoutLongitude: -58.4,
            checkoutDistanceMeters: 8,
            checkoutStatus: "CHECKOUT_VALID",
            checkoutReviewReason: null,
            earlyDepartureMinutes: 0,
            extraWorkedMinutes: 0,
            checkoutMessageSid: sid,
            checkoutAt: new Date().toISOString(),
          },
        );
        if (!updated) {
          await transaction.rollback();
          return null;
        }
        await transaction.commit();
        return updated;
      } catch (error) {
        try {
          await transaction.rollback();
        } catch {
          // ignore rollback after failed commit/race
        }
        throw error;
      }
    };

    const results = await Promise.allSettled([
      runCheckout(`SM-co-A-${randomUUID()}`),
      runCheckout(`SM-co-B-${randomUUID()}`),
    ]);

    const withRow = results.filter(
      (row) => row.status === "fulfilled" && row.value !== null,
    );
    const nullWins = results.filter(
      (row) => row.status === "fulfilled" && row.value === null,
    );
    assert.equal(withRow.length, 1);
    assert.ok(nullWins.length + results.filter((r) => r.status === "rejected").length >= 1);

    const finalRow = await pool
      .request()
      .input("id", sql.UniqueIdentifier, attendanceId)
      .query(`SELECT checkout_at, checkout_message_sid FROM attendance_records WHERE id = @id`);
    assert.ok(finalRow.recordset[0].checkout_at);
  });
});
