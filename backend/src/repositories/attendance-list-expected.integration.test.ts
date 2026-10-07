import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { getPool } from "../database/connection";
import { attendanceRepository } from "../repositories/attendance.repository";
import { attendanceService } from "../services/attendance.service";
import { attendanceAuthoritativeClock } from "../utils/attendance-authoritative-clock";

const uuid = (): string => randomUUID();

describeDatabaseIntegration("attendance list expected workdays integration", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let otherCompanyId = "";
  let serviceId = "";
  let clockNow = new Date("2026-09-30T15:00:00.000Z");
  let restoreClock: (() => void) | null = null;

  before(async () => {
    await setupDatabaseIntegration();
    const pool = getPool();
    const companies = await pool.request().query(`
      SELECT TOP 2 id FROM companies WHERE status = N'ACTIVE' ORDER BY created_at ASC
    `);
    companyId = String(companies.recordset[0]?.id ?? "");
    otherCompanyId = String(companies.recordset[1]?.id ?? companies.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    restoreClock = (() => {
      const original = attendanceAuthoritativeClock.now.bind(attendanceAuthoritativeClock);
      attendanceAuthoritativeClock.now = () => clockNow;
      return () => {
        attendanceAuthoritativeClock.now = original;
      };
    })();
  });

  after(async () => {
    restoreClock?.();
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  async function seedWorkday(input: {
    employeeName: string;
    expectedStart: Date;
    expectedEnd: Date;
    lateToleranceMinutes?: number;
    earlyToleranceMinutes?: number;
    expectationStatus?: "EXPECTED" | "CANCELLED" | "JUSTIFIED";
  }) {
    const pool = getPool();
    const phone = `+54911${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 9)}`;
    // Unique start to avoid UQ_scheduled_operations_active_service_start collisions.
    const uniqueSkewMs = (Date.now() % 1_000_000) + Math.floor(Math.random() * 1_000_000);
    const expectedStart = new Date(input.expectedStart.getTime() + uniqueSkewMs);
    const expectedEnd = new Date(input.expectedEnd.getTime() + uniqueSkewMs);
    const workDate = expectedStart.toISOString().slice(0, 10);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), input.employeeName)
      .input("phone", sql.NVarChar(20), phone)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, expectedStart)
      .input("scheduledEnd", sql.DateTime2, expectedEnd)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (
          @companyId, @serviceId, @scheduledStart, @scheduledEnd,
          15, 20, N'SCHEDULED', N'ONE_TIME'
        );
        SELECT id FROM @inserted;
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const assignmentInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("validFrom", sql.Date, expectedStart.toISOString().slice(0, 10))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, confirmation_status
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (NEWID(), @companyId, @operationId, @employeeId, @validFrom, N'CONFIRMED');
        SELECT id FROM @inserted;
      `);
    const assignmentId = String(assignmentInsert.recordset[0].id);

    const workdayInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .input("expectedStart", sql.DateTime2, expectedStart)
      .input("expectedEnd", sql.DateTime2, expectedEnd)
      .input("earlyTol", sql.Int, input.earlyToleranceMinutes ?? 15)
      .input("lateTol", sql.Int, input.lateToleranceMinutes ?? 20)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (
          @companyId, @operationId, @workDate, @expectedStart, @expectedEnd,
          @earlyTol, @lateTol
        );
        SELECT id FROM @inserted;
      `);
    const operationWorkdayId = String(workdayInsert.recordset[0].id);

    const employeeWorkdayInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("expectationStatus", sql.NVarChar(30), input.expectationStatus ?? "EXPECTED")
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employee_workdays (
          company_id, operation_workday_id, employee_id, operation_assignment_id, expectation_status
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (
          @companyId, @operationWorkdayId, @employeeId, @assignmentId, @expectationStatus
        );
        SELECT id FROM @inserted;
      `);
    const employeeWorkdayId = String(employeeWorkdayInsert.recordset[0].id);

    return { employeeId, operationId, employeeWorkdayId, serviceId, expectedStart, expectedEnd };
  }

  async function insertAttendance(input: {
    operationId: string;
    employeeId: string;
    employeeWorkdayId: string;
    receivedAt: Date | null;
    checkoutAt?: Date | null;
    punctualityStatus: string;
    isSimulation?: boolean;
    simulationSessionId?: string | null;
  }) {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
      .input("receivedAt", sql.DateTime2, input.receivedAt)
      .input("checkoutAt", sql.DateTime2, input.checkoutAt ?? null)
      .input("punctualityStatus", sql.NVarChar(30), input.punctualityStatus)
      .input("isSimulation", sql.Bit, input.isSimulation ? 1 : 0)
      .input("simulationSessionId", sql.UniqueIdentifier, input.simulationSessionId ?? null)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO attendance_records (
          company_id, operation_id, employee_id, employee_workday_id,
          received_latitude, received_longitude, distance_meters,
          validation_status, location_status, punctuality_status,
          received_at, checkout_at, is_simulation, simulation_session_id, arrival_source
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (
          @companyId, @operationId, @employeeId, @employeeWorkdayId,
          -34.6, -58.4, 10,
          N'VALID', N'INSIDE_GEOFENCE', @punctualityStatus,
          @receivedAt, @checkoutAt, @isSimulation, @simulationSessionId, N'WHATSAPP'
        );
        SELECT id FROM @inserted;
      `);
    return String(result.recordset[0].id);
  }

  it("lists ON_TIME / EARLY / LATE / EXPECTED / ABSENT / missing checkout and multi-shift", async () => {
    const baseStart = new Date("2030-03-15T12:00:00.000Z");
    const baseEnd = new Date("2030-03-15T20:00:00.000Z");

    const onTime = await seedWorkday({
      employeeName: "OnTime",
      expectedStart: baseStart,
      expectedEnd: baseEnd,
    });
    clockNow = new Date(onTime.expectedEnd.getTime() - 60 * 60_000);
    await insertAttendance({
      ...onTime,
      receivedAt: new Date(onTime.expectedStart.getTime()),
      punctualityStatus: "ON_TIME",
    });

    const early = await seedWorkday({
      employeeName: "Early",
      expectedStart: baseStart,
      expectedEnd: baseEnd,
    });
    await insertAttendance({
      ...early,
      receivedAt: new Date(early.expectedStart.getTime() - 10 * 60_000),
      punctualityStatus: "EARLY",
    });

    const late = await seedWorkday({
      employeeName: "Late",
      expectedStart: baseStart,
      expectedEnd: baseEnd,
    });
    await insertAttendance({
      ...late,
      receivedAt: new Date(late.expectedStart.getTime() + 25 * 60_000),
      punctualityStatus: "LATE",
    });

    const expectedOpen = await seedWorkday({
      employeeName: "ExpectedOpen",
      expectedStart: baseStart,
      expectedEnd: baseEnd,
      lateToleranceMinutes: 30,
    });
    // Still inside opportunity window.
    clockNow = new Date(expectedOpen.expectedEnd.getTime() + 10 * 60_000);

    const absent = await seedWorkday({
      employeeName: "Absent",
      expectedStart: baseStart,
      expectedEnd: baseEnd,
      lateToleranceMinutes: 10,
    });
    clockNow = new Date(absent.expectedEnd.getTime() + 60 * 60_000);

    const openCheckout = await seedWorkday({
      employeeName: "OpenCheckout",
      expectedStart: baseStart,
      expectedEnd: baseEnd,
    });
    await insertAttendance({
      ...openCheckout,
      receivedAt: new Date(openCheckout.expectedStart.getTime() + 5 * 60_000),
      checkoutAt: null,
      punctualityStatus: "ON_TIME",
    });

    const multiA = await seedWorkday({
      employeeName: "MultiShiftA",
      expectedStart: new Date("2030-03-15T08:00:00.000Z"),
      expectedEnd: new Date("2030-03-15T12:00:00.000Z"),
    });
    const multiB = await seedWorkday({
      employeeName: "MultiShiftB",
      expectedStart: new Date("2030-03-15T14:00:00.000Z"),
      expectedEnd: new Date("2030-03-15T18:00:00.000Z"),
    });

    const cancelled = await seedWorkday({
      employeeName: "Cancelled",
      expectedStart: baseStart,
      expectedEnd: baseEnd,
      expectationStatus: "CANCELLED",
    });

    const employeeIds = [
      onTime.employeeId,
      early.employeeId,
      late.employeeId,
      expectedOpen.employeeId,
      absent.employeeId,
      openCheckout.employeeId,
      multiA.employeeId,
      multiB.employeeId,
      cancelled.employeeId,
    ];

    // Re-evaluate ABSENT with clock after all seeds; EXPECTED_OPEN needs earlier clock — list twice.
    clockNow = new Date(expectedOpen.expectedEnd.getTime() + 10 * 60_000);
    const expectedList = await attendanceRepository.list(companyId, {
      page: 1,
      limit: 100,
      operationIds: [],
      employeeIds: [expectedOpen.employeeId],
      serviceIds: [],
      openAttendance: false,
    });
    assert.equal(expectedList.items[0]?.effectiveState, "EXPECTED");
    assert.equal(expectedList.items[0]?.hasAttendanceRecord, false);
    assert.equal(expectedList.items[0]?.validationStatus, null);

    clockNow = new Date(absent.expectedEnd.getTime() + 2 * 60 * 60_000);
    const listed = await attendanceRepository.list(companyId, {
      page: 1,
      limit: 100,
      operationIds: [],
      employeeIds,
      serviceIds: [],
      openAttendance: false,
    });

    const byWorkday = new Map(listed.items.map((row) => [row.employeeWorkdayId, row]));
    assert.equal(byWorkday.get(onTime.employeeWorkdayId)?.punctualityStatus, "ON_TIME");
    assert.equal(byWorkday.get(early.employeeWorkdayId)?.punctualityStatus, "EARLY");
    assert.equal(byWorkday.get(late.employeeWorkdayId)?.punctualityStatus, "LATE");
    assert.equal(byWorkday.get(absent.employeeWorkdayId)?.effectiveState, "ABSENT");
    assert.equal(byWorkday.get(openCheckout.employeeWorkdayId)?.checkoutAt, null);
    assert.ok(byWorkday.get(multiA.employeeWorkdayId));
    assert.ok(byWorkday.get(multiB.employeeWorkdayId));
    assert.equal(byWorkday.has(cancelled.employeeWorkdayId), false);
    assert.equal(listed.total, listed.items.length);
  });

  it("applies singular operationId / employeeId / serviceId filters", async () => {
    const seeded = await seedWorkday({
      employeeName: "SingularFilter",
      expectedStart: new Date("2030-04-01T12:00:00.000Z"),
      expectedEnd: new Date("2030-04-01T20:00:00.000Z"),
    });
    clockNow = new Date(seeded.expectedEnd.getTime() + 60 * 60_000);

    const byOperation = await attendanceRepository.list(companyId, {
      page: 1,
      limit: 20,
      operationId: seeded.operationId,
      operationIds: [],
      employeeIds: [],
      serviceIds: [],
      openAttendance: false,
    });
    assert.ok(byOperation.items.some((row) => row.employeeWorkdayId === seeded.employeeWorkdayId));

    const byEmployee = await attendanceRepository.list(companyId, {
      page: 1,
      limit: 20,
      employeeId: seeded.employeeId,
      operationIds: [],
      employeeIds: [],
      serviceIds: [],
      openAttendance: false,
    });
    assert.ok(byEmployee.items.some((row) => row.employeeWorkdayId === seeded.employeeWorkdayId));

    const byService = await attendanceRepository.list(companyId, {
      page: 1,
      limit: 20,
      serviceId: seeded.serviceId,
      operationIds: [],
      employeeIds: [seeded.employeeId],
      serviceIds: [],
      openAttendance: false,
    });
    assert.ok(byService.items.some((row) => row.employeeWorkdayId === seeded.employeeWorkdayId));
  });

  it("keeps expected no-punch rows in real and all, and isolates simulations", async () => {
    const realOnly = await seedWorkday({
      employeeName: "RealNoPunch",
      expectedStart: new Date("2030-05-01T08:00:00.000Z"),
      expectedEnd: new Date("2030-05-01T12:00:00.000Z"),
    });
    const withSim = await seedWorkday({
      employeeName: "WithSim",
      expectedStart: new Date("2030-05-01T08:00:00.000Z"),
      expectedEnd: new Date("2030-05-01T12:00:00.000Z"),
    });
    clockNow = new Date(realOnly.expectedEnd.getTime() + 2 * 60 * 60_000);
    const simSessionId = uuid();
    const simulationAttendanceId = await insertAttendance({
      ...withSim,
      receivedAt: new Date(withSim.expectedStart.getTime() + 10 * 60_000),
      punctualityStatus: "ON_TIME",
      isSimulation: true,
      simulationSessionId: simSessionId,
    });

    const real = await attendanceRepository.list(companyId, {
      page: 1,
      limit: 50,
      operationIds: [],
      employeeIds: [realOnly.employeeId, withSim.employeeId],
      serviceIds: [],
      openAttendance: false,
    });
    assert.ok(real.items.some((row) => row.employeeWorkdayId === realOnly.employeeWorkdayId));
    assert.ok(real.items.every((row) => !row.isSimulation));

    const all = await attendanceRepository.list(companyId, {
      page: 1,
      limit: 50,
      operationIds: [],
      employeeIds: [realOnly.employeeId, withSim.employeeId],
      serviceIds: [],
      openAttendance: false,
      includeSimulation: true,
    });
    assert.ok(all.items.some((row) => row.employeeWorkdayId === realOnly.employeeWorkdayId));
    assert.ok(all.items.some((row) => row.listRowKind === "simulation" && row.id === simulationAttendanceId));
    assert.equal(all.total, all.items.length);

    const keys = all.items.map((row) => row.listRowKey);
    assert.equal(new Set(keys).size, keys.length);

    const simulationOnly = await attendanceRepository.list(companyId, {
      page: 1,
      limit: 50,
      operationIds: [],
      employeeIds: [withSim.employeeId],
      serviceIds: [],
      openAttendance: false,
      simulationOnly: true,
    });
    assert.ok(simulationOnly.items.every((row) => row.isSimulation));
  });

  it("isolates tenant detail by employeeWorkdayId and exports ABSENT", async () => {
    const seeded = await seedWorkday({
      employeeName: "TenantDetail",
      expectedStart: new Date("2030-06-01T08:00:00.000Z"),
      expectedEnd: new Date("2030-06-01T12:00:00.000Z"),
    });
    clockNow = new Date(seeded.expectedEnd.getTime() + 2 * 60 * 60_000);

    const detail = await attendanceRepository.findExpectedByEmployeeWorkdayId(
      companyId,
      seeded.employeeWorkdayId,
    );
    assert.ok(detail);
    assert.equal(detail.hasAttendanceRecord, false);
    assert.equal(detail.effectiveState, "ABSENT");

    if (otherCompanyId && otherCompanyId !== companyId) {
      const foreign = await attendanceRepository.findExpectedByEmployeeWorkdayId(
        otherCompanyId,
        seeded.employeeWorkdayId,
      );
      assert.equal(foreign, null);
    }

    const csv = await attendanceService.exportCsv(companyId, {
      page: 1,
      limit: 100,
      operationIds: [],
      employeeIds: [seeded.employeeId],
      serviceIds: [],
      openAttendance: false,
    });
    assert.match(csv, /ABSENT/);
  });

  it("excludes future workdays even with an early punch; lists started workdays", async () => {
    clockNow = new Date("2026-10-06T15:00:00.000Z");

    const futureNoPunch = await seedWorkday({
      employeeName: "FutureNoPunch",
      expectedStart: new Date("2026-10-20T12:00:00.000Z"),
      expectedEnd: new Date("2026-10-20T20:00:00.000Z"),
    });
    const futureWithPunch = await seedWorkday({
      employeeName: "FutureWithPunch",
      expectedStart: new Date("2026-10-20T12:00:00.000Z"),
      expectedEnd: new Date("2026-10-20T20:00:00.000Z"),
    });
    await insertAttendance({
      ...futureWithPunch,
      receivedAt: new Date("2026-10-06T14:30:00.000Z"),
      punctualityStatus: "EARLY",
    });
    const startedNoPunch = await seedWorkday({
      employeeName: "StartedNoPunch",
      expectedStart: new Date("2026-10-06T12:00:00.000Z"),
      expectedEnd: new Date("2026-10-06T20:00:00.000Z"),
    });
    const startedOpenCheckout = await seedWorkday({
      employeeName: "StartedOpenCheckout",
      expectedStart: new Date("2026-10-06T08:00:00.000Z"),
      expectedEnd: new Date("2026-10-06T12:00:00.000Z"),
    });
    await insertAttendance({
      ...startedOpenCheckout,
      receivedAt: new Date("2026-10-06T08:05:00.000Z"),
      checkoutAt: null,
      punctualityStatus: "ON_TIME",
    });

    const listed = await attendanceRepository.list(companyId, {
      page: 1,
      limit: 50,
      operationIds: [],
      employeeIds: [
        futureNoPunch.employeeId,
        futureWithPunch.employeeId,
        startedNoPunch.employeeId,
        startedOpenCheckout.employeeId,
      ],
      serviceIds: [],
      openAttendance: false,
    });
    const workdayIds = new Set(listed.items.map((row) => row.employeeWorkdayId));
    assert.equal(workdayIds.has(futureNoPunch.employeeWorkdayId), false);
    assert.equal(workdayIds.has(futureWithPunch.employeeWorkdayId), false);
    assert.equal(workdayIds.has(startedNoPunch.employeeWorkdayId), true);
    assert.equal(workdayIds.has(startedOpenCheckout.employeeWorkdayId), true);

    const missingCheckout = await attendanceRepository.list(companyId, {
      page: 1,
      limit: 50,
      operationIds: [],
      employeeIds: [startedOpenCheckout.employeeId],
      serviceIds: [],
      openAttendance: false,
      checkoutStatus: "NOT_RECORDED",
    });
    assert.equal(missingCheckout.items.length, 1);
    assert.equal(missingCheckout.items[0]?.employeeWorkdayId, startedOpenCheckout.employeeWorkdayId);
  });

  it("reports production attendances without employee_workday_id (preflight)", async () => {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT COUNT(*) AS production_without_workday
      FROM attendance_records
      WHERE is_simulation = 0
        AND employee_workday_id IS NULL
    `);
    const count = Number(result.recordset[0].production_without_workday);
    assert.ok(Number.isFinite(count));
    // Legacy orphans remain visible via listCombinedAttendanceUniverse when count > 0.
    // eslint-disable-next-line no-console -- preflight evidence for review package
    console.log(`PREFLIGHT_production_without_workday=${count}`);

    const dangling = await pool.request().query(`
      SELECT COUNT(*) AS dangling_workday_refs
      FROM attendance_records ar
      WHERE ar.is_simulation = 0
        AND ar.employee_workday_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM employee_workdays ew WHERE ew.id = ar.employee_workday_id
        )
    `);
    const danglingCount = Number(dangling.recordset[0].dangling_workday_refs);
    assert.ok(Number.isFinite(danglingCount));
    // eslint-disable-next-line no-console -- preflight evidence for review package
    console.log(`PREFLIGHT_dangling_workday_refs=${danglingCount}`);

    const indexes = await pool.request().query(`
      SELECT i.name AS index_name, i.is_unique AS is_unique,
             COL_NAME(ic.object_id, ic.column_id) AS col_name, ic.key_ordinal AS key_ordinal
      FROM sys.indexes i
      JOIN sys.index_columns ic
        ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      WHERE i.object_id = OBJECT_ID(N'dbo.attendance_records')
        AND i.name LIKE N'%employee_workday%'
      ORDER BY i.name, ic.key_ordinal
    `);
    for (const row of indexes.recordset) {
      // eslint-disable-next-line no-console -- preflight evidence for review package
      console.log(
        `PREFLIGHT_INDEX name=${row.index_name} unique=${row.is_unique} ord=${row.key_ordinal} col=${row.col_name}`,
      );
    }
  });
});
