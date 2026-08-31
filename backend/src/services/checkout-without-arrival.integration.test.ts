/**
 * Real SQL Server coverage for checkout without prior arrival:
 * - migration 108 shape constraints
 * - concurrent exit-only inserts (unique workday index)
 * - checkout_message_sid idempotency
 * - cancel race → candidate unavailable
 *
 * Enable with RUN_DB_INTEGRATION_TESTS=true and required DB env vars.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { attendanceRepository } from "../repositories/attendance.repository";
import {
  CheckoutCommandError,
  employeeWorkdayCheckoutCommand,
  resolveExitOnlyValidationStatus,
} from "./employee-workday-checkout.command";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";

describeDatabaseIntegration("checkout without arrival SQL", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let serviceId = "";
  let serviceLatitude = 0;
  let serviceLongitude = 0;

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
        SELECT TOP 1 id, latitude, longitude
        FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    serviceId = String(serviceResult.recordset[0]?.id ?? "");
    serviceLatitude = Number(serviceResult.recordset[0]?.latitude);
    serviceLongitude = Number(serviceResult.recordset[0]?.longitude);
    assert.ok(serviceId);
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const createWorkdayFixture = async (input?: {
    cancelled?: boolean;
    expectedEndAt?: Date | null;
  }) => {
    const pool = getPool();
    const phone = `+54911${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `ExitOnly ${randomUUID().slice(0, 8)}`)
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    // ~3h ago (still inside pending-expiration) with ms jitter for UQ_scheduled_operations_active_service_start.
    const start = new Date(Date.now() - 3 * 60 * 60 * 1000 - Math.floor(Math.random() * 10_000));
    const end =
      input?.expectedEndAt === null
        ? null
        : (input?.expectedEndAt ?? new Date(start.getTime() + 10 * 60 * 60 * 1000));

    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .input("status", sql.NVarChar(30), input?.cancelled ? "CANCELLED" : "SCHEDULED")
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          120, 120, @status
        )
      `);
    const operationId = String(operationInsert.recordset[0].id);
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

    const workDate = start.toISOString().slice(0, 10);
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
          company_id, operation_workday_id, employee_id, operation_assignment_id,
          expectation_status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @operationWorkdayId, @employeeId, @assignmentId, N'EXPECTED'
        )
      `);
    const employeeWorkdayId = String(ewInsert.recordset[0].id);

    return { employeeId, operationId, employeeWorkdayId, start, end };
  };

  it("migration 108: nullable arrival + exit-only CHECK accepts and rejects shapes", async () => {
    const pool = getPool();
    const cols = await pool.request().query(`
      SELECT c.name, c.is_nullable
      FROM sys.columns c
      WHERE c.object_id = OBJECT_ID(N'dbo.attendance_records')
        AND c.name IN (
          N'received_at', N'received_latitude', N'received_longitude', N'distance_meters'
        )
    `);
    const byName = new Map(
      cols.recordset.map((row: { name: string; is_nullable: boolean }) => [
        String(row.name),
        Boolean(row.is_nullable),
      ]),
    );
    assert.equal(byName.get("received_at"), true);
    assert.equal(byName.get("received_latitude"), true);
    assert.equal(byName.get("received_longitude"), true);
    assert.equal(byName.get("distance_meters"), true);

    const fixture = await createWorkdayFixture();
    const checkoutAt = new Date().toISOString();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    let created;
    try {
      created = await attendanceRepository.createExitOnlyWithCheckoutInTransaction(
        companyId,
        tx,
        {
          operationId: fixture.operationId,
          employeeId: fixture.employeeId,
          employeeWorkdayId: fixture.employeeWorkdayId,
          validationStatus: "VALID",
          checkoutLatitude: serviceLatitude,
          checkoutLongitude: serviceLongitude,
          checkoutDistanceMeters: 10,
          checkoutStatus: "CHECKOUT_VALID",
          checkoutReviewReason: "ok",
          earlyDepartureMinutes: 0,
          extraWorkedMinutes: 0,
          checkoutMessageSid: `SM-exit-ok-${randomUUID()}`,
          checkoutAt,
        },
      );
      await tx.commit();
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw error;
    }

    assert.equal(created.receivedAt, null);
    assert.equal(created.punctualityStatus, "NOT_RECORDED");
    assert.ok(created.checkoutAt);

    // Invalid: null arrival without checkout
    await assert.rejects(async () => {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, fixture.operationId)
        .input("employeeId", sql.UniqueIdentifier, fixture.employeeId)
        .query(`
          INSERT INTO attendance_records (
            company_id, operation_id, employee_id,
            received_latitude, received_longitude, distance_meters,
            validation_status, location_status, punctuality_status, received_at
          )
          VALUES (
            @companyId, @operationId, @employeeId,
            NULL, NULL, NULL,
            N'VALID', N'NOT_RECORDED', N'NOT_RECORDED', NULL
          )
        `);
    });

    // Invalid: null received_at with non-null latitude
    await assert.rejects(async () => {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, fixture.operationId)
        .input("employeeId", sql.UniqueIdentifier, fixture.employeeId)
        .input("checkoutAt", sql.DateTime2, new Date())
        .query(`
          INSERT INTO attendance_records (
            company_id, operation_id, employee_id,
            received_latitude, received_longitude, distance_meters,
            validation_status, location_status, punctuality_status, received_at,
            checkout_at, checkout_status
          )
          VALUES (
            @companyId, @operationId, @employeeId,
            -34.6, NULL, NULL,
            N'VALID', N'NOT_RECORDED', N'NOT_RECORDED', NULL,
            @checkoutAt, N'CHECKOUT_VALID'
          )
        `);
    });
  });

  it("concurrent exit-only checkouts yield one attendance and one CHECKOUT_DUPLICATE", async () => {
    const fixture = await createWorkdayFixture();
    const sidA = `SM-conc-a-${randomUUID()}`;
    const sidB = `SM-conc-b-${randomUUID()}`;
    const checkoutAt = new Date().toISOString();

    const run = (messageSid: string) =>
      employeeWorkdayCheckoutCommand.registerExitWithoutArrival({
        companyId,
        employeeId: fixture.employeeId,
        operationId: fixture.operationId,
        employeeWorkdayId: fixture.employeeWorkdayId,
        eligibilityAt: new Date(),
        fields: {
          checkoutLatitude: serviceLatitude,
          checkoutLongitude: serviceLongitude,
          checkoutDistanceMeters: 5,
          checkoutStatus: "CHECKOUT_VALID",
          checkoutReviewReason: "concurrent",
          earlyDepartureMinutes: 0,
          extraWorkedMinutes: 0,
          checkoutMessageSid: messageSid,
          checkoutAt,
        },
      });

    const results = await Promise.allSettled([run(sidA), run(sidB)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(
      fulfilled.length,
      1,
      `expected one success, got ${JSON.stringify(results.map((r) => r.status === "rejected" ? { status: r.status, code: (r.reason as { code?: string })?.code, message: String(r.reason) } : { status: r.status }))}`,
    );
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]?.status === "rejected");
    assert.ok(rejected[0].reason instanceof CheckoutCommandError, String(rejected[0].reason));
    assert.equal(rejected[0].reason.code, "CHECKOUT_DUPLICATE");

    const count = await getPool()
      .request()
      .input("employeeWorkdayId", sql.UniqueIdentifier, fixture.employeeWorkdayId)
      .query(`
        SELECT COUNT(*) AS total
        FROM attendance_records
        WHERE employee_workday_id = @employeeWorkdayId
          AND is_simulation = 0
          AND validation_status IN (N'VALID', N'PENDING_REVIEW')
      `);
    assert.equal(Number(count.recordset[0].total), 1);
  });

  it("duplicate checkout_message_sid maps to CHECKOUT_MESSAGE_SID_DUPLICATE", async () => {
    const fixtureA = await createWorkdayFixture();
    const fixtureB = await createWorkdayFixture();
    const sharedSid = `SM-idem-${randomUUID()}`;
    const checkoutAt = new Date().toISOString();

    await employeeWorkdayCheckoutCommand.registerExitWithoutArrival({
      companyId,
      employeeId: fixtureA.employeeId,
      operationId: fixtureA.operationId,
      employeeWorkdayId: fixtureA.employeeWorkdayId,
      eligibilityAt: new Date(),
      fields: {
        checkoutLatitude: serviceLatitude,
        checkoutLongitude: serviceLongitude,
        checkoutDistanceMeters: 5,
        checkoutStatus: "CHECKOUT_VALID",
        checkoutReviewReason: "first",
        earlyDepartureMinutes: 0,
        extraWorkedMinutes: 0,
        checkoutMessageSid: sharedSid,
        checkoutAt,
      },
    });

    await assert.rejects(
      () =>
        employeeWorkdayCheckoutCommand.registerExitWithoutArrival({
          companyId,
          employeeId: fixtureB.employeeId,
          operationId: fixtureB.operationId,
          employeeWorkdayId: fixtureB.employeeWorkdayId,
          eligibilityAt: new Date(),
          fields: {
            checkoutLatitude: serviceLatitude,
            checkoutLongitude: serviceLongitude,
            checkoutDistanceMeters: 5,
            checkoutStatus: "CHECKOUT_VALID",
            checkoutReviewReason: "dup sid",
            earlyDepartureMinutes: 0,
            extraWorkedMinutes: 0,
            checkoutMessageSid: sharedSid,
            checkoutAt: new Date().toISOString(),
          },
        }),
      (error: unknown) =>
        error instanceof CheckoutCommandError &&
        error.code === "CHECKOUT_MESSAGE_SID_DUPLICATE",
    );
  });

  it("cancelled operation makes exit-without-arrival unavailable before commit", async () => {
    const fixture = await createWorkdayFixture();
    await getPool()
      .request()
      .input("operationId", sql.UniqueIdentifier, fixture.operationId)
      .query(`
        UPDATE scheduled_operations
        SET status = N'CANCELLED'
        WHERE id = @operationId
      `);

    await assert.rejects(
      () =>
        employeeWorkdayCheckoutCommand.registerExitWithoutArrival({
          companyId,
          employeeId: fixture.employeeId,
          operationId: fixture.operationId,
          employeeWorkdayId: fixture.employeeWorkdayId,
          eligibilityAt: new Date(),
          fields: {
            checkoutLatitude: serviceLatitude,
            checkoutLongitude: serviceLongitude,
            checkoutDistanceMeters: 5,
            checkoutStatus: "CHECKOUT_VALID",
            checkoutReviewReason: "cancelled",
            earlyDepartureMinutes: 0,
            extraWorkedMinutes: 0,
            checkoutMessageSid: `SM-cancel-${randomUUID()}`,
            checkoutAt: new Date().toISOString(),
          },
        }),
      (error: unknown) =>
        error instanceof CheckoutCommandError &&
        error.code === "CHECKOUT_CANDIDATE_UNAVAILABLE",
    );
  });

  it("CHECKOUT_REJECTED persists as validation_status REJECTED (not VALID)", async () => {
    assert.equal(resolveExitOnlyValidationStatus("CHECKOUT_REJECTED"), "REJECTED");
    const fixture = await createWorkdayFixture();
    const created = await employeeWorkdayCheckoutCommand.registerExitWithoutArrival({
      companyId,
      employeeId: fixture.employeeId,
      operationId: fixture.operationId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      eligibilityAt: new Date(),
      fields: {
        checkoutLatitude: serviceLatitude + 1,
        checkoutLongitude: serviceLongitude + 1,
        checkoutDistanceMeters: 5000,
        checkoutStatus: "CHECKOUT_REJECTED",
        checkoutReviewReason: "fuera de radio",
        earlyDepartureMinutes: 0,
        extraWorkedMinutes: 0,
        checkoutMessageSid: `SM-rej-${randomUUID()}`,
        checkoutAt: new Date().toISOString(),
      },
    });

    assert.equal(created.validationStatus, "REJECTED");
    assert.equal(created.receivedAt, null);
    assert.equal(created.checkoutStatus, "CHECKOUT_REJECTED");

    // REJECTED is outside unique active index — a later VALID exit-only may still succeed.
    const retry = await employeeWorkdayCheckoutCommand.registerExitWithoutArrival({
      companyId,
      employeeId: fixture.employeeId,
      operationId: fixture.operationId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      eligibilityAt: new Date(),
      fields: {
        checkoutLatitude: serviceLatitude,
        checkoutLongitude: serviceLongitude,
        checkoutDistanceMeters: 8,
        checkoutStatus: "CHECKOUT_VALID",
        checkoutReviewReason: "retry ok",
        earlyDepartureMinutes: 0,
        extraWorkedMinutes: 0,
        checkoutMessageSid: `SM-retry-${randomUUID()}`,
        checkoutAt: new Date().toISOString(),
      },
    });
    assert.equal(retry.validationStatus, "VALID");
  });

  it("scheduledEnd null remains eligible under pending-expiration COALESCE(start)", async () => {
    const fixture = await createWorkdayFixture({ expectedEndAt: null });
    const created = await employeeWorkdayCheckoutCommand.registerExitWithoutArrival({
      companyId,
      employeeId: fixture.employeeId,
      operationId: fixture.operationId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      eligibilityAt: new Date(),
      fields: {
        checkoutLatitude: serviceLatitude,
        checkoutLongitude: serviceLongitude,
        checkoutDistanceMeters: 4,
        checkoutStatus: "CHECKOUT_VALID",
        checkoutReviewReason: "no end",
        earlyDepartureMinutes: 0,
        extraWorkedMinutes: 0,
        checkoutMessageSid: `SM-null-end-${randomUUID()}`,
        checkoutAt: new Date().toISOString(),
      },
    });
    assert.equal(created.receivedAt, null);
    assert.ok(created.checkoutAt);
  });
});
