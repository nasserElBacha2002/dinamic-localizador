/**
 * Confirmation reminder must not cancel physical attendance bot sessions.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { botSessionService } from "./bot-session.service";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("bot-session confirmation vs physical attendance", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let serviceId = "";
  let operationId = "";

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

    const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const op = await pool
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
          15, 15, N'SCHEDULED'
        )
      `);
    operationId = String(op.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const insertEmployee = async (suffix: number): Promise<{ employeeId: string; phone: string }> => {
    const pool = getPool();
    const phone = uniquePhone(suffix);
    const emp = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `Confirmation Protect Emp ${suffix}`)
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
    return { employeeId, phone };
  };

  const assertSessionState = async (
    phone: string,
    expectedState: string,
    expectedId: string,
  ): Promise<void> => {
    const pool = getPool();
    const row = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        SELECT TOP 1 id, state
        FROM bot_sessions
        WHERE company_id = @companyId
          AND phone_number = @phone
        ORDER BY created_at DESC
      `);
    assert.equal(String(row.recordset[0]?.id), expectedId);
    assert.equal(String(row.recordset[0]?.state), expectedState);
    assert.notEqual(String(row.recordset[0]?.state), "CANCELLED");
  };

  const tryCreateConfirmation = async (employeeId: string, phone: string) =>
    botSessionService.createAttendanceConfirmationResponseSession(companyId, {
      employeeId,
      phoneNumber: phone,
      operationId,
      notificationId: "11111111-1111-4111-8111-111111111111",
      scheduleVersion: 1,
      scheduledStart: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });

  it("preserves WAITING_LOCATION when confirmation session is requested", async () => {
    const { employeeId, phone } = await insertEmployee(1);
    // createWaitingLocationSession requires employeeWorkdayId FK — insert via repository create path
    // only if schema allows null employee_workday_id; otherwise use service with a real workday.
    const pool = getPool();
    const workdayProbe = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT TOP 1 ew.id AS employee_workday_id
        FROM operation_workdays ow
        INNER JOIN employee_workdays ew
          ON ew.operation_workday_id = ow.id AND ew.company_id = ow.company_id
        WHERE ow.company_id = @companyId AND ow.operation_id = @operationId
      `);

    let waiting: Awaited<ReturnType<typeof botSessionService.createWaitingLocationSession>>;
    if (workdayProbe.recordset[0]?.employee_workday_id) {
      waiting = await botSessionService.createWaitingLocationSession(companyId, {
        employeeId,
        phoneNumber: phone,
        operationId,
        employeeWorkdayId: String(workdayProbe.recordset[0].employee_workday_id),
      });
    } else {
      // Persist physical session directly when workday materialization is absent.
      const { botSessionRepository } = await import("../repositories/bot-session.repository");
      waiting = await botSessionRepository.create({
        companyId,
        employeeId,
        operationId,
        employeeWorkdayId: null,
        attendanceRecordId: null,
        phoneNumber: phone,
        state: "WAITING_LOCATION",
        contextJson: null,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
    }

    const result = await tryCreateConfirmation(employeeId, phone);
    assert.equal(result.status, "BLOCKED_BY_PHYSICAL_ATTENDANCE");
    if (result.status === "BLOCKED_BY_PHYSICAL_ATTENDANCE") {
      assert.equal(result.activeSessionId, waiting.id);
      assert.equal(result.activeState, "WAITING_LOCATION");
    }
    await assertSessionState(phone, "WAITING_LOCATION", waiting.id);
  });

  it("preserves WAITING_CHECKOUT_LOCATION when confirmation session is requested", async () => {
    const { employeeId, phone } = await insertEmployee(2);
    const { botSessionRepository } = await import("../repositories/bot-session.repository");
    const waiting = await botSessionRepository.create({
      companyId,
      employeeId,
      operationId,
      employeeWorkdayId: null,
      attendanceRecordId: null,
      phoneNumber: phone,
      state: "WAITING_CHECKOUT_LOCATION",
      contextJson: null,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const result = await tryCreateConfirmation(employeeId, phone);
    assert.equal(result.status, "BLOCKED_BY_PHYSICAL_ATTENDANCE");
    if (result.status === "BLOCKED_BY_PHYSICAL_ATTENDANCE") {
      assert.equal(result.activeState, "WAITING_CHECKOUT_LOCATION");
    }
    await assertSessionState(phone, "WAITING_CHECKOUT_LOCATION", waiting.id);
  });

  it("preserves WAITING_OPERATION_SELECTION when confirmation session is requested", async () => {
    const { employeeId, phone } = await insertEmployee(3);
    const { botSessionRepository } = await import("../repositories/bot-session.repository");
    const waiting = await botSessionRepository.create({
      companyId,
      employeeId,
      operationId: null,
      employeeWorkdayId: null,
      attendanceRecordId: null,
      phoneNumber: phone,
      state: "WAITING_OPERATION_SELECTION",
      contextJson: JSON.stringify({ workdayOptions: [] }),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const result = await tryCreateConfirmation(employeeId, phone);
    assert.equal(result.status, "BLOCKED_BY_PHYSICAL_ATTENDANCE");
    await assertSessionState(phone, "WAITING_OPERATION_SELECTION", waiting.id);
  });

  it("preserves WAITING_CHECKOUT_OPERATION_SELECTION when confirmation session is requested", async () => {
    const { employeeId, phone } = await insertEmployee(4);
    const { botSessionRepository } = await import("../repositories/bot-session.repository");
    const waiting = await botSessionRepository.create({
      companyId,
      employeeId,
      operationId: null,
      employeeWorkdayId: null,
      attendanceRecordId: null,
      phoneNumber: phone,
      state: "WAITING_CHECKOUT_OPERATION_SELECTION",
      contextJson: JSON.stringify({ workdayOptions: [] }),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const result = await tryCreateConfirmation(employeeId, phone);
    assert.equal(result.status, "BLOCKED_BY_PHYSICAL_ATTENDANCE");
    await assertSessionState(phone, "WAITING_CHECKOUT_OPERATION_SELECTION", waiting.id);
  });
});
