/**
 * Manual operation coverage must align needsCoverage / hasOperationalReplacement on impact.
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
} from "../../test-helpers/integration-test";
import { getPool } from "../../database/connection";
import { absenceRequestRepository } from "../../repositories/absence/absence-request.repository";
import { absenceOperationalImpactRepository } from "../../repositories/absence/absence-operational-impact.repository";
import { absenceWorkdaySyncJobRepository } from "../../repositories/absence/absence-workday-sync-job.repository";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";
import { absenceWorkdaySyncService } from "./absence-workday-sync.service";
import { operationAssignmentService } from "../operations/operation-assignment.service";
import { operationWorkDateService } from "../operations/operation-work-date.service";

const uniquePhone = (n: number): string =>
  `+54911${Date.now().toString().slice(-7)}${n}`;

describeDatabaseIntegration("absence operational impact manual coverage", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let adminUserId = "";

  before(async () => {
    await setupDatabaseIntegration();
    const pool = getPool();
    const company = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    companyId = String(company.recordset[0]?.id ?? "");
    assert.ok(companyId);
    await companySettingsRepository.update(companyId, {
      absenceOperationalIntegrationEnabled: true,
    });
    const user = await pool.request().query(`
      SELECT TOP 1 id FROM users ORDER BY created_at ASC
    `);
    adminUserId = String(user.recordset[0]?.id ?? "");
    assert.ok(adminUserId);
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("OPEN conflict clears needsCoverage after manual asCoverage from operation", async () => {
    const pool = getPool();

    const absentEmp = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), "Coverage Absent Emp")
      .input("phone", sql.NVarChar(20), uniquePhone(11))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const absentEmployeeId = String(absentEmp.recordset[0].id);
    fixtures.trackEmployee(companyId, absentEmployeeId);

    const coverEmp = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), "Coverage Replacement Emp")
      .input("phone", sql.NVarChar(20), uniquePhone(12))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const coverEmployeeId = String(coverEmp.recordset[0].id);
    fixtures.trackEmployee(companyId, coverEmployeeId);

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
      `);
    const serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const start = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const op = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("startAt", sql.DateTime2, start)
      .input("endAt", sql.DateTime2, new Date(start.getTime() + 8 * 60 * 60 * 1000))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end, status
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @serviceId, N'ONE_TIME', @startAt, @endAt, N'SCHEDULED');
        SELECT id FROM @inserted;
      `);
    const operationId = String(op.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const workDate = await operationWorkDateService.resolveOperationWorkDate(
      companyId,
      operationId,
    );

    const assignment = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      absentEmployeeId,
      { validFrom: workDate, validUntil: workDate },
      adminUserId,
    );

    const type = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM absence_types WHERE company_id = @companyId AND is_active = 1
      `);
    const absenceTypeId = String(type.recordset[0]?.id ?? "");
    assert.ok(absenceTypeId);

    const created = await absenceRequestRepository.create(companyId, {
      employeeId: absentEmployeeId,
      absenceTypeId,
      startDate: workDate,
      endDate: workDate,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      totalDays: 1,
      reason: "manual coverage impact test",
      requestedVia: "ADMIN",
    });

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, created.id)
      .query(`
        UPDATE absence_requests
        SET status = N'APPROVED',
            operational_impact_version = 1,
            reviewed_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await absenceOperationalImpactRepository.upsertConflict({
      companyId,
      absenceRequestId: created.id,
      absenceVersion: 1,
      conflictType: "ASSIGNMENT_DURING_ABSENCE",
      severity: "WARNING",
      employeeId: absentEmployeeId,
      operationId,
      serviceId,
      assignmentId: assignment.id,
      idempotencyKey: `coverage-impact:${randomUUID()}`,
      rangeStartAt: start,
      rangeEndAt: new Date(start.getTime() + 8 * 60 * 60 * 1000),
    });

    await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId: created.id,
      absenceStatus: "APPROVED",
      operation: "APPROVE",
      expectedOperationalImpactVersion: 1,
      enqueueCommandId: `coverage-impact-approve-${randomUUID()}`,
    });
    await absenceWorkdaySyncService.processPendingJobs(5);

    const before = await absenceOperationalImpactQueryService.computeImpact(
      companyId,
      created.id,
    );
    const workdayBefore = before.workdays.find((w) => w.operationId === operationId);
    assert.ok(workdayBefore);
    assert.equal(workdayBefore?.needsCoverage, true);
    assert.equal(workdayBefore?.hasOperationalReplacement, false);

    await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      coverEmployeeId,
      {
        validFrom: workDate,
        validUntil: workDate,
        asCoverage: true,
        replacedAssignmentId: assignment.id,
        replacedEmployeeId: absentEmployeeId,
        coverageReason: "Cobertura desde operación (test)",
      },
      adminUserId,
    );

    const after = await absenceOperationalImpactQueryService.computeImpact(
      companyId,
      created.id,
    );
    const workdayAfter = after.workdays.find((w) => w.operationId === operationId);
    assert.ok(workdayAfter);
    assert.equal(workdayAfter?.needsCoverage, false);
    assert.equal(workdayAfter?.hasOperationalReplacement, true);
  });
});
