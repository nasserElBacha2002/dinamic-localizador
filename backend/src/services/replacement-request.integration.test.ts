/**
 * Real SQL Server coverage for replacement candidate materialization:
 * - ONE_TIME workdays do not send effectiveDate to the recommender
 * - RECURRING workdays send the occurrence date as YYYY-MM-DD
 * - the absent employee is never offered
 * - repeated unavailability for the same workday reuses one request
 *
 * Enable with RUN_DB_INTEGRATION_TESTS=true and required DB env vars.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, it, mock } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { individualRecommendationService } from "./individual-recommendation.service";
import { replacementRequestService } from "./replacement-request.service";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";

describeDatabaseIntegration("replacement request SQL", () => {
  const fixtures = createIntegrationFixtureTracker();
  const employeeWorkdayIds: string[] = [];
  let companyId = "";
  let serviceId = "";

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const serviceResult = await getPool()
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

  afterEach(() => {
    mock.restoreAll();
  });

  after(async () => {
    const pool = getPool();
    for (const employeeWorkdayId of employeeWorkdayIds) {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
        .query(`
          DELETE c FROM replacement_request_candidates c
          JOIN replacement_requests rr ON rr.id = c.request_id AND rr.company_id = c.company_id
          WHERE rr.company_id = @companyId AND rr.absent_employee_workday_id = @employeeWorkdayId;
          DELETE n FROM replacement_request_notifications n
          JOIN replacement_requests rr ON rr.id = n.request_id AND rr.company_id = n.company_id
          WHERE rr.company_id = @companyId AND rr.absent_employee_workday_id = @employeeWorkdayId;
          DELETE FROM replacement_requests
          WHERE company_id = @companyId AND absent_employee_workday_id = @employeeWorkdayId;
        `);
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const insertEmployee = async (label: string): Promise<string> => {
    const phone = `+54911${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `${label} ${randomUUID().slice(0, 8)}`)
      .input("phone", sql.NVarChar(30), phone)
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

  const createUnavailableWorkday = async (operationKind: "ONE_TIME" | "RECURRING") => {
    const pool = getPool();
    const absentEmployeeId = await insertEmployee("Replacement absent");
    await insertEmployee("Replacement candidate");

    // Future start with ms jitter avoids UQ_scheduled_operations_active_service_start collisions.
    const start = new Date(
      Date.now() + 2 * 60 * 60 * 1000 + (1 + Math.floor(Math.random() * 2_700_000)),
    );
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const workDate = start.toISOString().slice(0, 10);

    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("operationKind", sql.NVarChar(20), operationKind)
      .input("scheduledStart", sql.DateTime2, operationKind === "ONE_TIME" ? start : null)
      .input("scheduledEnd", sql.DateTime2, operationKind === "ONE_TIME" ? end : null)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, @operationKind, @scheduledStart, @scheduledEnd,
          30, 15, N'SCHEDULED'
        )
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const workdayInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .input("start", sql.DateTime2, start)
      .input("end", sql.DateTime2, end)
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @operationId, @workDate, @start, @end, 30, 15, 1, 'ACTIVE')
      `);
    const operationWorkdayId = String(workdayInsert.recordset[0].id);

    const assignmentInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, absentEmployeeId)
      .input("workDate", sql.Date, workDate)
      .input("validUntil", sql.Date, operationKind === "ONE_TIME" ? workDate : null)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until
        )
        OUTPUT INSERTED.id
        VALUES (NEWID(), @companyId, @operationId, @employeeId, @workDate, @validUntil)
      `);
    const assignmentId = String(assignmentInsert.recordset[0].id);

    const employeeWorkdayInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, absentEmployeeId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        INSERT INTO employee_workdays (
          company_id, operation_workday_id, employee_id, operation_assignment_id,
          expectation_status, unavailable_at
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @operationWorkdayId, @employeeId, @assignmentId,
          N'EXPECTED', SYSUTCDATETIME()
        )
      `);
    const employeeWorkdayId = String(employeeWorkdayInsert.recordset[0].id);
    employeeWorkdayIds.push(employeeWorkdayId);

    return { operationId, absentEmployeeId, employeeWorkdayId, workDate };
  };

  const loadRequestState = async (employeeWorkdayId: string) => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        SELECT rr.id, rr.status, rr.candidates_materialized_at,
          (SELECT COUNT(*) FROM replacement_request_candidates c
            WHERE c.company_id = rr.company_id AND c.request_id = rr.id) AS candidate_count
        FROM replacement_requests rr
        WHERE rr.company_id = @companyId AND rr.absent_employee_workday_id = @employeeWorkdayId
      `);
    const candidates = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        SELECT c.employee_id FROM replacement_request_candidates c
        JOIN replacement_requests rr ON rr.id = c.request_id AND rr.company_id = c.company_id
        WHERE rr.company_id = @companyId AND rr.absent_employee_workday_id = @employeeWorkdayId
      `);
    return {
      requests: result.recordset as Array<Record<string, unknown>>,
      candidateEmployeeIds: candidates.recordset.map((row: Record<string, unknown>) =>
        String(row.employee_id).toLowerCase(),
      ),
    };
  };

  it("ONE_TIME: materializes candidates without effectiveDate and excludes the absent employee", async () => {
    mock.method(companyAlertRecipientRepository, "findEnabledRecipients", async () => []);
    const recommend = mock.method(individualRecommendationService, "recommendEmployees");
    const fixture = await createUnavailableWorkday("ONE_TIME");

    await replacementRequestService.createForUnavailable({
      companyId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      employeeId: fixture.absentEmployeeId,
    });

    assert.equal(recommend.mock.callCount(), 1);
    assert.equal(recommend.mock.calls[0].arguments[3], undefined);

    const state = await loadRequestState(fixture.employeeWorkdayId);
    assert.equal(state.requests.length, 1);
    assert.equal(String(state.requests[0].status), "PENDING");
    assert.ok(state.requests[0].candidates_materialized_at);
    assert.ok(Number(state.requests[0].candidate_count) > 0);
    assert.equal(state.candidateEmployeeIds.includes(fixture.absentEmployeeId.toLowerCase()), false);
  });

  it("RECURRING: passes the occurrence work date as YYYY-MM-DD", async () => {
    mock.method(companyAlertRecipientRepository, "findEnabledRecipients", async () => []);
    const recommend = mock.method(individualRecommendationService, "recommendEmployees");
    const fixture = await createUnavailableWorkday("RECURRING");

    await replacementRequestService.createForUnavailable({
      companyId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      employeeId: fixture.absentEmployeeId,
    });

    assert.equal(recommend.mock.callCount(), 1);
    assert.equal(recommend.mock.calls[0].arguments[3], fixture.workDate);

    const state = await loadRequestState(fixture.employeeWorkdayId);
    assert.equal(state.requests.length, 1);
    assert.ok(state.requests[0].candidates_materialized_at);
    assert.equal(state.candidateEmployeeIds.includes(fixture.absentEmployeeId.toLowerCase()), false);
  });

  it("repeated unavailability for the same workday reuses one request and its candidates", async () => {
    mock.method(companyAlertRecipientRepository, "findEnabledRecipients", async () => []);
    const fixture = await createUnavailableWorkday("ONE_TIME");
    const input = {
      companyId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      employeeId: fixture.absentEmployeeId,
    };

    await replacementRequestService.createForUnavailable(input);
    const first = await loadRequestState(fixture.employeeWorkdayId);
    await replacementRequestService.createForUnavailable(input);
    const second = await loadRequestState(fixture.employeeWorkdayId);

    assert.equal(second.requests.length, 1);
    assert.equal(String(second.requests[0].id), String(first.requests[0].id));
    assert.equal(
      Number(second.requests[0].candidate_count),
      Number(first.requests[0].candidate_count),
    );
  });
});
