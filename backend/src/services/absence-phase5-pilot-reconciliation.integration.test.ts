/**
 * Phase 5 pilot operational reconciliation (autonomous fixtures).
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
import { getPool } from "../database/connection";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { absenceWorkdaySyncJobRepository } from "../repositories/absence-workday-sync-job.repository";
import { absenceOperationalImpactRepository } from "../repositories/absence-operational-impact.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { absenceOperationalConflictService } from "./absence-operational-conflict.service";
import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";
import { absenceWorkdaySyncService } from "./absence-workday-sync.service";
import { operationAssignmentService } from "./operation-assignment.service";

const uniquePhone = (n: number): string =>
  `+54911${Date.now().toString().slice(-7)}${n}`;

describeDatabaseIntegration("phase5 pilot operational reconciliation", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let adminUserId = "";
  const report: string[] = [];

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
    if (report.length) {
      console.info("\n=== PHASE5 PILOT REPORT ===\n" + report.join("\n") + "\n=== END PILOT REPORT ===\n");
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("end-to-end: assign → absence → approve job → conflict → resolve → cancel supersede", async () => {
    const pool = getPool();

    const emp = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), "Pilot Absent Emp")
      .input("phone", sql.NVarChar(20), uniquePhone(90))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(emp.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);
    report.push(`BEFORE employeeId=${employeeId}`);

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
      `);
    const serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const start = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    const workDate = start.toISOString().slice(0, 10);
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
    report.push(`BEFORE operationId=${operationId} workDate=${workDate}`);

    const assignment = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      employeeId,
      { validFrom: workDate, validUntil: workDate },
      adminUserId,
    );
    report.push(`BEFORE assignmentId=${assignment.id}`);

    const type = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM absence_types WHERE company_id = @companyId AND is_active = 1
      `);
    const absenceTypeId = String(type.recordset[0]?.id ?? "");
    assert.ok(absenceTypeId);

    const created = await absenceRequestRepository.create(companyId, {
      employeeId,
      absenceTypeId,
      startDate: workDate,
      endDate: workDate,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      totalDays: 1,
      reason: "phase5 pilot reconciliation",
      requestedVia: "ADMIN",
    });

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, created.id)
      .query(`
        UPDATE absence_requests
        SET status = N'APPROVED',
            operational_impact_version = 1,
            operational_reconciliation_status = N'PENDING',
            reviewed_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
    report.push(`AFTER approve absenceRequestId=${created.id}`);

    await absenceOperationalImpactRepository.upsertConflict({
      companyId,
      absenceRequestId: created.id,
      absenceVersion: 1,
      conflictType: "ASSIGNMENT_DURING_ABSENCE",
      severity: "WARNING",
      employeeId,
      operationId,
      serviceId,
      assignmentId: assignment.id,
      idempotencyKey: `pilot-conflict:${randomUUID()}`,
      rangeStartAt: start,
      rangeEndAt: new Date(start.getTime() + 8 * 60 * 60 * 1000),
    });

    await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId: created.id,
      absenceStatus: "APPROVED",
      operation: "APPROVE",
      expectedOperationalImpactVersion: 1,
      enqueueCommandId: `pilot-approve-${randomUUID()}`,
    });

    const sync = await absenceWorkdaySyncService.processPendingJobs(5);
    report.push(
      `AFTER processPendingJobs processed=${sync.processed} failed=${sync.failed} superseded=${sync.superseded} leaseLost=${sync.leaseLost}`,
    );

    const impact = await absenceOperationalImpactQueryService.computeImpact(
      companyId,
      created.id,
    );
    report.push(
      `AFTER impact reconciliationStatus=${impact.reconciliationStatus} openConflicts=${impact.openConflictsCount ?? impact.conflicts?.length ?? "n/a"}`,
    );

    const openConflicts = await pool
      .request()
      .input("absenceRequestId", sql.UniqueIdentifier, created.id)
      .query(`
        SELECT TOP 1 id FROM absence_operational_conflicts
        WHERE absence_request_id = @absenceRequestId AND status = N'OPEN'
        ORDER BY created_at DESC
      `);
    const conflictId = openConflicts.recordset[0]
      ? String(openConflicts.recordset[0].id)
      : null;
    assert.ok(conflictId, "expected OPEN conflict for pilot resolve");

    const resolved = await absenceOperationalConflictService.resolveConflict(
      companyId,
      created.id,
      conflictId,
      {
        resolutionCode: "CANCEL_ASSIGNMENT",
        resolutionReason: "pilot cancel assignment",
        resolvedByUserId: adminUserId,
        commandId: `pilot-resolve-${randomUUID()}`,
      },
    );
    assert.equal(resolved.status, "RESOLVED");
    report.push(`AFTER resolve conflictId=${conflictId} status=${resolved.status}`);

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, created.id)
      .query(`
        UPDATE absence_requests
        SET status = N'CANCELLED',
            operational_impact_version = operational_impact_version + 1,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId: created.id,
      absenceStatus: "CANCELLED",
      operation: "CANCEL",
      expectedOperationalImpactVersion: 2,
      enqueueCommandId: `pilot-cancel-${randomUUID()}`,
    });

    const sync2 = await absenceWorkdaySyncService.processPendingJobs(5);
    report.push(
      `AFTER cancel processPendingJobs processed=${sync2.processed} failed=${sync2.failed} superseded=${sync2.superseded}`,
    );

    const assignmentRow = await pool
      .request()
      .input("id", sql.UniqueIdentifier, assignment.id)
      .query(`SELECT cancelled_at FROM operation_assignments WHERE id = @id`);
    assert.ok(assignmentRow.recordset[0]?.cancelled_at);
    report.push("AFTER verify assignment cancelled_at is set");
    report.push("PILOT_RESULT=PASS");
  });
});
