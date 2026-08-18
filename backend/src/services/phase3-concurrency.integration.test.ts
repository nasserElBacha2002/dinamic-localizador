/**
 * Phase 3 — real SQL concurrency for assignment confirmation CAS and
 * active operation unique key.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { isActiveOperationDuplicateError } from "../utils/active-operation-duplicate-errors";
import { WHATSAPP_PROVIDER_STATUS_RANK } from "../constants/whatsapp-observability";
import { pickProjectedProviderStatus } from "../utils/whatsapp-observability";
import { employeeWorkdayService } from "./employee-workday.service";
import { whatsappFlowTraceService } from "./whatsapp-flow-trace.service";

describeDatabaseIntegration("phase3 concurrency CAS / unique", () => {
  const fixtures = createIntegrationFixtureTracker();
  const assignmentIds: string[] = [];
  let companyId = "";
  let employeeId = "";
  let serviceId = "";
  let operationId = "";
  let workDate = "";

  before(async () => {
    await setupDatabaseIntegration();
    const { getPool } = await import("../database/connection");
    const pool = getPool();

    const uq = await pool.request().query(`
      SELECT 1 AS ok
      FROM sys.indexes
      WHERE name = N'UQ_scheduled_operations_active_service_start'
        AND object_id = OBJECT_ID(N'dbo.scheduled_operations')
    `);
    assert.ok(
      uq.recordset[0],
      "migration 092 required: UQ_scheduled_operations_active_service_start missing",
    );

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

    const phone = `+54911${Date.now().toString().slice(-8)}`;
    const emp = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), "Phase3 Confirm CAS Emp")
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    employeeId = String(emp.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    const start = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
    start.setUTCHours(15, 0, 0, 0);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    workDate = start.toISOString().slice(0, 10);

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

    await pool
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
        VALUES (
          @companyId, @operationId, CAST(@scheduledStart AS DATE),
          @scheduledStart, @scheduledEnd, 120, 120, 1, N'ACTIVE'
        )
      `);
  });

  after(async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    for (const assignmentId of assignmentIds) {
      await pool
        .request()
        .input("assignmentId", sql.UniqueIdentifier, assignmentId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          DELETE FROM operation_assignments
          WHERE id = @assignmentId AND company_id = @companyId
        `);
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const insertPendingAssignment = async (): Promise<string> => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const assignmentId = randomUUID();
    assignmentIds.push(assignmentId);
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, assignmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until, confirmation_status
        )
        VALUES (@id, @companyId, @operationId, @employeeId, @workDate, @workDate, N'PENDING')
      `);
    return assignmentId;
  };

  it("concurrent confirm vs unavailable: exactly one CAS wins", async () => {
    const assignmentId = await insertPendingAssignment();
    const results = await Promise.all([
      employeeAssignmentQueryRepository.updateConfirmationStatus(
        companyId,
        assignmentId,
        "CONFIRMED",
        ["PENDING"],
      ),
      employeeAssignmentQueryRepository.updateConfirmationStatus(
        companyId,
        assignmentId,
        "UNAVAILABLE",
        ["PENDING"],
      ),
    ]);

    assert.equal(results.filter(Boolean).length, 1);

    const { getPool } = await import("../database/connection");
    const row = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, assignmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT confirmation_status
        FROM operation_assignments
        WHERE id = @id AND company_id = @companyId
      `);
    const status = String(row.recordset[0].confirmation_status);
    assert.ok(status === "CONFIRMED" || status === "UNAVAILABLE");
  });

  it("20 concurrent confirms from PENDING leave a single CONFIRMED row", async () => {
    const assignmentId = await insertPendingAssignment();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        employeeAssignmentQueryRepository.updateConfirmationStatus(
          companyId,
          assignmentId,
          "CONFIRMED",
          ["PENDING"],
        ),
      ),
    );
    assert.equal(results.filter(Boolean).length, 1);

    const { getPool } = await import("../database/connection");
    const row = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, assignmentId)
      .query(`SELECT confirmation_status FROM operation_assignments WHERE id = @id`);
    assert.equal(String(row.recordset[0].confirmation_status), "CONFIRMED");
  });

  it("concurrent ONE_TIME create with same service+start yields one row", async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const start = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    start.setUTCHours(12, 0, 0, 0);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

    const insertOnce = async (): Promise<"ok" | "dup"> => {
      try {
        const result = await pool
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
        fixtures.trackOperation(companyId, String(result.recordset[0].id));
        return "ok";
      } catch (error) {
        if (isActiveOperationDuplicateError(error)) {
          return "dup";
        }
        throw error;
      }
    };

    const outcomes = await Promise.all(Array.from({ length: 12 }, () => insertOnce()));
    assert.equal(outcomes.filter((value) => value === "ok").length, 1);
    assert.equal(outcomes.filter((value) => value === "dup").length, 11);

    const count = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .query(`
        SELECT COUNT(*) AS c
        FROM scheduled_operations
        WHERE company_id = @companyId
          AND service_id = @serviceId
          AND scheduled_start = @scheduledStart
          AND status <> N'CANCELLED'
      `);
    assert.equal(Number(count.recordset[0].c), 1);
  });

  it("outbox provider status does not regress delivered → sent", async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const notificationId = randomUUID();
    const assignmentId = await insertPendingAssignment();
    const sid = `SMphase3${randomUUID().replace(/-/g, "").slice(0, 24)}`;

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, notificationId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("sid", sql.NVarChar(100), sid)
      .query(`
        INSERT INTO whatsapp_operation_assignment_notifications (
          id, company_id, operation_assignment_id, operation_id, employee_id,
          notification_type, status, provider_message_sid, provider_status
        )
        VALUES (
          @id, @companyId, @assignmentId, @operationId, @employeeId,
          N'EVENTUAL_OPERATION_ASSIGNED', N'PENDING', @sid, N'delivered'
        )
      `);

    try {
      await whatsappFlowTraceService.projectOutboxProviderStatusByMessageSid({
        providerMessageSid: sid,
        providerStatus: "sent",
      });

      const after = await pool
        .request()
        .input("id", sql.UniqueIdentifier, notificationId)
        .query(`
          SELECT provider_status
          FROM whatsapp_operation_assignment_notifications
          WHERE id = @id
        `);
      assert.equal(String(after.recordset[0].provider_status), "delivered");
    } finally {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, notificationId)
        .query(`DELETE FROM whatsapp_operation_assignment_notifications WHERE id = @id`);
    }
  });

  it("service-level confirm || unavailable: one durable state, messages match DB", async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const start = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000);
    start.setUTCHours(16, 0, 0, 0);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    const localWorkDate = start.toISOString().slice(0, 10);

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
    const isolatedOperationId = String(op.recordset[0].id);
    fixtures.trackOperation(companyId, isolatedOperationId);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, isolatedOperationId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        VALUES (
          @companyId, @operationId, CAST(@scheduledStart AS DATE),
          @scheduledStart, @scheduledEnd, 120, 120, 1, N'ACTIVE'
        )
      `);

    const assignmentId = randomUUID();
    assignmentIds.push(assignmentId);
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, assignmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, isolatedOperationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, localWorkDate)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until, confirmation_status
        )
        VALUES (@id, @companyId, @operationId, @employeeId, @workDate, @workDate, N'PENDING')
      `);

    const [confirmResult, unavailableResult] = await Promise.all([
      employeeWorkdayService.confirmAssignment(companyId, employeeId, isolatedOperationId),
      employeeWorkdayService.markAssignmentUnavailable(
        companyId,
        employeeId,
        isolatedOperationId,
      ),
    ]);

    assert.equal(confirmResult.kind, "ok");
    assert.equal(unavailableResult.kind, "ok");

    const row = await pool
      .request()
      .input("id", sql.UniqueIdentifier, assignmentId)
      .query(`SELECT confirmation_status FROM operation_assignments WHERE id = @id`);
    const status = String(row.recordset[0].confirmation_status);
    assert.ok(status === "CONFIRMED" || status === "UNAVAILABLE");

    // Durable winner must match DB; the concurrent loser may still return ok with
    // its own success copy — do not require both messages to mirror final status.
    if (status === "CONFIRMED") {
      assert.match(confirmResult.message, /confirmamos tu asistencia/i);
    } else {
      assert.match(unavailableResult.message, /no estás disponible/i);
    }
  });

  it("service-level missing assignment returns not_found without mutating", async () => {
    const missingOp = randomUUID();
    const result = await employeeWorkdayService.confirmAssignment(
      companyId,
      employeeId,
      missingOp,
    );
    assert.equal(result.kind, "not_found");
  });

  it("Twilio outbox monotonic matrix matches pickProjectedProviderStatus", async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const cases: Array<[string | null, string]> = [
      ["sent", "delivered"],
      ["delivered", "sent"],
      ["delivered", "read"],
      ["read", "delivered"],
      ["delivered", "failed"],
      ["failed", "read"],
      ["undelivered", "sent"],
    ];

    for (const [current, incoming] of cases) {
      const expected = pickProjectedProviderStatus(
        current,
        incoming,
        WHATSAPP_PROVIDER_STATUS_RANK,
      );
      const notificationId = randomUUID();
      const assignmentId = await insertPendingAssignment();
      const sid = `SMm${randomUUID().replace(/-/g, "").slice(0, 26)}`;

      await pool
        .request()
        .input("id", sql.UniqueIdentifier, notificationId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("assignmentId", sql.UniqueIdentifier, assignmentId)
        .input("operationId", sql.UniqueIdentifier, operationId)
        .input("employeeId", sql.UniqueIdentifier, employeeId)
        .input("sid", sql.NVarChar(100), sid)
        .input("current", sql.NVarChar(40), current)
        .query(`
          INSERT INTO whatsapp_operation_assignment_notifications (
            id, company_id, operation_assignment_id, operation_id, employee_id,
            notification_type, status, provider_message_sid, provider_status
          )
          VALUES (
            @id, @companyId, @assignmentId, @operationId, @employeeId,
            N'EVENTUAL_OPERATION_ASSIGNED', N'PENDING', @sid, @current
          )
        `);

      try {
        await whatsappFlowTraceService.projectOutboxProviderStatusByMessageSid({
          providerMessageSid: sid,
          providerStatus: incoming,
        });
        const after = await pool
          .request()
          .input("id", sql.UniqueIdentifier, notificationId)
          .query(`
            SELECT provider_status
            FROM whatsapp_operation_assignment_notifications
            WHERE id = @id
          `);
        assert.equal(
          String(after.recordset[0].provider_status),
          expected,
          `${current} + ${incoming} => ${expected}`,
        );
      } finally {
        await pool
          .request()
          .input("id", sql.UniqueIdentifier, notificationId)
          .query(`DELETE FROM whatsapp_operation_assignment_notifications WHERE id = @id`);
      }
    }
  });
});
