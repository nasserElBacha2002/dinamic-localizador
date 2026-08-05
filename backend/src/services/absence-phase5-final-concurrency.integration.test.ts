/**
 * Phase 5 final — autonomous SQL concurrency suite (12 scenarios).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 *
 * Creates its own employees/operations/jobs/conflicts; cleans up via fixture tracker.
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
import { absenceOperationalConflictService, __setResolveConflictFailurePointForTests } from "./absence-operational-conflict.service";
import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";
import { absenceOperationalReconciliationService } from "./absence-operational-reconciliation.service";
import { operationAssignmentService } from "./operation-assignment.service";
import { operationWorkDateService } from "./operation-work-date.service";
import { AppError } from "../errors/app-error";
import { buildAttendanceDuringAbsenceConflictKey } from "../types/absence-operational-impact";
import { getDateIsoInTimezone } from "../utils/absence-date";

const uniquePhone = (n: number): string =>
  `+54911${Date.now().toString().slice(-7)}${n}`;

describeDatabaseIntegration("phase5 final SQL concurrency suite", () => {
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

  const insertEmployee = async (name: string, suffix: number): Promise<string> => {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), name)
      .input("phone", sql.NVarChar(20), uniquePhone(suffix))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const id = String(result.recordset[0].id);
    fixtures.trackEmployee(companyId, id);
    return id;
  };

  const insertOneTimeOperation = async (): Promise<{
    operationId: string;
    serviceId: string;
    workDate: string;
  }> => {
    const pool = getPool();
    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId);
    const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const op = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes,
          late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED', 'ONE_TIME');
        SELECT id FROM @inserted;
      `);
    const operationId = String(op.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);
    // Canonical work date in company TZ (SQL CAST AS date can differ from UTC overnight).
    const workDate = await operationWorkDateService.resolveOperationWorkDate(
      companyId,
      operationId,
    );
    return {
      operationId,
      serviceId,
      workDate,
    };
  };

  const insertOpenAssignmentConflict = async (input: {
    absenceRequestId: string;
    employeeId: string;
    operationId: string;
    serviceId: string;
    assignmentId: string;
    version?: number;
  }) => {
    return absenceOperationalImpactRepository.upsertConflict({
      companyId,
      absenceRequestId: input.absenceRequestId,
      absenceVersion: input.version ?? 1,
      conflictType: "ASSIGNMENT_DURING_ABSENCE",
      severity: "WARNING",
      employeeId: input.employeeId,
      operationId: input.operationId,
      serviceId: input.serviceId,
      assignmentId: input.assignmentId,
      idempotencyKey: `test-conflict:${randomUUID()}`,
      rangeStartAt: new Date(),
      rangeEndAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });
  };

  const insertApprovedAbsenceStub = async (employeeId: string): Promise<string> => {
    const pool = getPool();
    const type = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM absence_types WHERE company_id = @companyId AND is_active = 1
      `);
    const absenceTypeId = String(type.recordset[0]?.id ?? "");
    assert.ok(absenceTypeId, "company must have an absence type");

    const companyTz = "America/Argentina/Buenos_Aires";
    const startDate = getDateIsoInTimezone(new Date(), companyTz);
    const endDate = getDateIsoInTimezone(
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      companyTz,
    );

    const created = await absenceRequestRepository.create(companyId, {
      employeeId,
      absenceTypeId,
      startDate,
      endDate,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      totalDays: 3,
      reason: "phase5 concurrency fixture",
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
    return created.id;
  };

  /**
   * Isolate claimNextPending from leftover PENDING/PROCESSING jobs.
   * claimNextPending is global (not company-scoped), so neutralize across all companies.
   */
  const neutralizeOpenJobs = async (): Promise<void> => {
    await getPool().request().query(`
      UPDATE absence_workday_sync_jobs
      SET status = N'FAILED',
          last_error = N'test-isolation-neutralize',
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = SYSUTCDATETIME()
      WHERE status IN (N'PENDING', N'PROCESSING')
    `);
  };

  it("8+10: two workers claim distinct jobs; expired lease recovers", async () => {
    await neutralizeOpenJobs();
    const employeeId = await insertEmployee("Concurrency Emp A", 1);
    const absenceRequestId = await insertApprovedAbsenceStub(employeeId);

    const jobA = await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId,
      absenceStatus: "APPROVED",
      operation: "MANUAL_RECONCILE",
      expectedOperationalImpactVersion: 1,
      enqueueCommandId: `enq-a-${randomUUID()}`,
    });
    const jobB = await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId,
      absenceStatus: "APPROVED",
      operation: "APPROVE",
      expectedOperationalImpactVersion: 1,
      enqueueCommandId: `enq-b-${randomUUID()}`,
    });

    const [c1, c2] = await Promise.all([
      absenceWorkdaySyncJobRepository.claimNextPending(8, {
        leaseOwner: `w1-${randomUUID()}`,
        leaseSeconds: 60,
      }),
      absenceWorkdaySyncJobRepository.claimNextPending(8, {
        leaseOwner: `w2-${randomUUID()}`,
        leaseSeconds: 60,
      }),
    ]);
    assert.ok(c1);
    assert.ok(c2);
    assert.notEqual(c1.id, c2.id);
    assert.ok([jobA.id, jobB.id].includes(c1.id));
    assert.ok([jobA.id, jobB.id].includes(c2.id));

    const token = absenceWorkdaySyncJobRepository.toLeaseToken(c1);
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, c1.id)
      .query(`
        UPDATE absence_workday_sync_jobs
        SET lease_expires_at = DATEADD(SECOND, -10, SYSUTCDATETIME())
        WHERE id = @id
      `);
    const recovered = await absenceWorkdaySyncJobRepository.recoverExpiredLeases(20);
    assert.ok(recovered >= 1);
    const after = await absenceWorkdaySyncJobRepository.findById(companyId, c1.id);
    assert.equal(after?.status, "PENDING");
    assert.equal(after?.leaseOwner, null);
    assert.match(String(after?.lastError), /LEASE_EXPIRED/);

    await assert.rejects(
      () => absenceWorkdaySyncJobRepository.markCompletedWithLease(token),
      (err: unknown) => err instanceof AppError && err.code === "JOB_LEASE_LOST",
    );
  });

  it("9: worker A loses lease; B completes; A gets JOB_LEASE_LOST", async () => {
    await neutralizeOpenJobs();
    const employeeId = await insertEmployee("Lease Lost Emp", 2);
    const absenceRequestId = await insertApprovedAbsenceStub(employeeId);
    await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId,
      absenceStatus: "APPROVED",
      operation: "MANUAL_RECONCILE",
      expectedOperationalImpactVersion: 1,
      enqueueCommandId: `lease-lost-${randomUUID()}`,
    });

    const claimedA = await absenceWorkdaySyncJobRepository.claimNextPending(8, {
      leaseOwner: `worker-a-${randomUUID()}`,
      leaseSeconds: 30,
    });
    assert.ok(claimedA);
    const tokenA = absenceWorkdaySyncJobRepository.toLeaseToken(claimedA);

    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, claimedA.id)
      .query(`
        UPDATE absence_workday_sync_jobs
        SET lease_expires_at = DATEADD(SECOND, -5, SYSUTCDATETIME())
        WHERE id = @id
      `);
    await absenceWorkdaySyncJobRepository.recoverExpiredLeases(10);

    const claimedB = await absenceWorkdaySyncJobRepository.claimNextPending(8, {
      leaseOwner: `worker-b-${randomUUID()}`,
      leaseSeconds: 60,
    });
    assert.ok(claimedB);
    assert.equal(claimedB.id, claimedA.id);
    const tokenB = absenceWorkdaySyncJobRepository.toLeaseToken(claimedB);
    await absenceWorkdaySyncJobRepository.markCompletedWithLease(tokenB);

    await assert.rejects(
      () => absenceWorkdaySyncJobRepository.markCompletedWithLease(tokenA),
      (err: unknown) => err instanceof AppError && err.code === "JOB_LEASE_LOST",
    );

    const finalJob = await absenceWorkdaySyncJobRepository.findById(companyId, claimedA.id);
    assert.equal(finalJob?.status, "COMPLETED");
  });

  it("12: manual reconcile duplicate commandId returns same job", async () => {
    const employeeId = await insertEmployee("Manual Recon Emp", 3);
    const absenceRequestId = await insertApprovedAbsenceStub(employeeId);
    const commandId = `manual-${randomUUID()}`;

    const first = await absenceOperationalReconciliationService.enqueueManualReconcile(
      companyId,
      absenceRequestId,
      adminUserId,
      commandId,
    );
    const second = await absenceOperationalReconciliationService.enqueueManualReconcile(
      companyId,
      absenceRequestId,
      adminUserId,
      commandId,
    );
    assert.equal(first.jobId, second.jobId);
    assert.equal(first.retryable, true);
  });

  it("reconciliation status stays PENDING when job pending and zero conflicts", async () => {
    const employeeId = await insertEmployee("Pending Status Emp", 4);
    const absenceRequestId = await insertApprovedAbsenceStub(employeeId);
    await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId,
      absenceStatus: "APPROVED",
      operation: "MANUAL_RECONCILE",
      expectedOperationalImpactVersion: 1,
      enqueueCommandId: `pending-status-${randomUUID()}`,
    });

    const impact = await absenceOperationalImpactQueryService.computeImpact(
      companyId,
      absenceRequestId,
    );
    assert.equal(impact.reconciliationStatus, "PENDING");
    assert.notEqual(impact.reconciliationStatus, "APPLIED");
  });

  it("1+2+3: concurrent ASSIGN_REPLACEMENT same/different commandId", async () => {
    const absent = await insertEmployee("Absent Emp", 5);
    const replacement = await insertEmployee("Replacement Emp", 6);
    const { operationId, serviceId, workDate } = await insertOneTimeOperation();
    const assignment = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      absent,
      { validFrom: workDate, validUntil: workDate },
      adminUserId,
    );
    const absenceRequestId = await insertApprovedAbsenceStub(absent);
    const conflict = await insertOpenAssignmentConflict({
      absenceRequestId,
      employeeId: absent,
      operationId,
      serviceId,
      assignmentId: assignment.id,
    });

    const sharedCommand = `shared-${randomUUID()}`;
    const [r1, r2] = await Promise.allSettled([
      absenceOperationalConflictService.resolveConflict(companyId, absenceRequestId, conflict.id, {
        resolutionCode: "ASSIGN_REPLACEMENT",
        resolutionReason: "reemplazo concurrente A",
        replacementEmployeeId: replacement,
        resolvedByUserId: adminUserId,
        commandId: sharedCommand,
      }),
      absenceOperationalConflictService.resolveConflict(companyId, absenceRequestId, conflict.id, {
        resolutionCode: "ASSIGN_REPLACEMENT",
        resolutionReason: "reemplazo concurrente B",
        replacementEmployeeId: replacement,
        resolvedByUserId: adminUserId,
        commandId: sharedCommand,
      }),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
    assert.ok(fulfilled.length >= 1);
    const resolvedIds = fulfilled.map(
      (r) => (r as PromiseFulfilledResult<{ id: string; status: string }>).value.status,
    );
    assert.ok(resolvedIds.every((s) => s === "RESOLVED"));

    const otherCommand = `other-${randomUUID()}`;
    await assert.rejects(
      () =>
        absenceOperationalConflictService.resolveConflict(companyId, absenceRequestId, conflict.id, {
          resolutionCode: "ASSIGN_REPLACEMENT",
          resolutionReason: "otro command",
          replacementEmployeeId: replacement,
          resolvedByUserId: adminUserId,
          commandId: otherCommand,
        }),
      (err: unknown) =>
        err instanceof AppError &&
        (err.code === "ABSENCE_OPERATIONAL_CONFLICT_NOT_OPEN" ||
          err.code === "RESOLUTION_COMMAND_CONFLICT"),
    );
  });

  it("5: CANCEL_ASSIGNMENT concurrent — one wins, assignment cancelled", async () => {
    const absent = await insertEmployee("Cancel Emp", 7);
    const { operationId, serviceId, workDate } = await insertOneTimeOperation();
    const assignment = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      absent,
      { validFrom: workDate, validUntil: workDate },
      adminUserId,
    );
    const absenceRequestId = await insertApprovedAbsenceStub(absent);
    const conflict = await insertOpenAssignmentConflict({
      absenceRequestId,
      employeeId: absent,
      operationId,
      serviceId,
      assignmentId: assignment.id,
    });

    const [a, b] = await Promise.allSettled([
      absenceOperationalConflictService.resolveConflict(companyId, absenceRequestId, conflict.id, {
        resolutionCode: "CANCEL_ASSIGNMENT",
        resolutionReason: "cancel concurrent A",
        resolvedByUserId: adminUserId,
        commandId: `cancel-a-${randomUUID()}`,
      }),
      absenceOperationalConflictService.resolveConflict(companyId, absenceRequestId, conflict.id, {
        resolutionCode: "CANCEL_ASSIGNMENT",
        resolutionReason: "cancel concurrent B",
        resolvedByUserId: adminUserId,
        commandId: `cancel-b-${randomUUID()}`,
      }),
    ]);

    const ok = [a, b].filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1);

    const pool = getPool();
    const row = await pool
      .request()
      .input("id", sql.UniqueIdentifier, assignment.id)
      .query(`SELECT cancelled_at FROM operation_assignments WHERE id = @id`);
    assert.ok(row.recordset[0]?.cancelled_at);

    const conflictRow = await absenceOperationalImpactRepository.findConflictById(
      companyId,
      absenceRequestId,
      conflict.id,
    );
    assert.equal(conflictRow?.status, "RESOLVED");
  });

  it("11: old APPROVE job superseded after CANCEL status change", async () => {
    await neutralizeOpenJobs();
    const employeeId = await insertEmployee("Supersede Emp", 8);
    const absenceRequestId = await insertApprovedAbsenceStub(employeeId);
    const job = await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId,
      absenceStatus: "APPROVED",
      operation: "APPROVE",
      expectedOperationalImpactVersion: 1,
      enqueueCommandId: `super-${randomUUID()}`,
    });
    const claimed = await absenceWorkdaySyncJobRepository.claimNextPending(8, {
      leaseOwner: `super-worker-${randomUUID()}`,
      leaseSeconds: 60,
    });
    assert.ok(claimed);
    assert.equal(claimed.id, job.id);
    const token = absenceWorkdaySyncJobRepository.toLeaseToken(claimed);

    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        UPDATE absence_requests
        SET status = N'CANCELLED',
            operational_impact_version = operational_impact_version + 1,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    const outcome = await absenceOperationalReconciliationService.executeClaimedJob(
      claimed,
      token,
    );
    assert.ok(outcome === "SUPERSEDED" || outcome === "LEASE_LOST");
    if (outcome === "SUPERSEDED") {
      const finalJob = await absenceWorkdaySyncJobRepository.findById(companyId, job.id);
      assert.equal(finalJob?.status, "SUPERSEDED");
    }
  });

  it("4: ASSIGN_REPLACEMENT rolls back when failure injected after assignment", async () => {
    const absent = await insertEmployee("Rollback Absent", 9);
    const replacement = await insertEmployee("Rollback Replacement", 10);
    const { operationId, serviceId, workDate } = await insertOneTimeOperation();
    const assignment = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      absent,
      { validFrom: workDate, validUntil: workDate },
      adminUserId,
    );
    const absenceRequestId = await insertApprovedAbsenceStub(absent);
    const conflict = await insertOpenAssignmentConflict({
      absenceRequestId,
      employeeId: absent,
      operationId,
      serviceId,
      assignmentId: assignment.id,
    });

    __setResolveConflictFailurePointForTests("after_assignment_created");
    try {
      await assert.rejects(
        () =>
          absenceOperationalConflictService.resolveConflict(companyId, absenceRequestId, conflict.id, {
            resolutionCode: "ASSIGN_REPLACEMENT",
            resolutionReason: "injected failure",
            replacementEmployeeId: replacement,
            resolvedByUserId: adminUserId,
            commandId: `fail-after-assign-${randomUUID()}`,
          }),
        (err: unknown) =>
          err instanceof Error && String(err.message).includes("INJECTED_FAILURE:after_assignment_created"),
      );
    } finally {
      __setResolveConflictFailurePointForTests(null);
    }

    const conflictRow = await absenceOperationalImpactRepository.findConflictById(
      companyId,
      absenceRequestId,
      conflict.id,
    );
    assert.equal(conflictRow?.status, "OPEN");

    const pool = getPool();
    const replacements = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, replacement)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM operation_assignments
        WHERE operation_id = @operationId
          AND employee_id = @employeeId
          AND cancelled_at IS NULL
      `);
    assert.equal(Number(replacements.recordset[0].cnt), 0);
  });

  it("4b: ASSIGN_REPLACEMENT rolls back when failure injected before audit", async () => {
    const absent = await insertEmployee("Audit Fail Absent", 11);
    const replacement = await insertEmployee("Audit Fail Replacement", 12);
    const { operationId, serviceId, workDate } = await insertOneTimeOperation();
    const assignment = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      absent,
      { validFrom: workDate, validUntil: workDate },
      adminUserId,
    );
    const absenceRequestId = await insertApprovedAbsenceStub(absent);
    const conflict = await insertOpenAssignmentConflict({
      absenceRequestId,
      employeeId: absent,
      operationId,
      serviceId,
      assignmentId: assignment.id,
    });

    __setResolveConflictFailurePointForTests("before_audit");
    try {
      await assert.rejects(
        () =>
          absenceOperationalConflictService.resolveConflict(companyId, absenceRequestId, conflict.id, {
            resolutionCode: "ASSIGN_REPLACEMENT",
            resolutionReason: "injected before audit",
            replacementEmployeeId: replacement,
            resolvedByUserId: adminUserId,
            commandId: `fail-before-audit-${randomUUID()}`,
          }),
        (err: unknown) =>
          err instanceof Error && String(err.message).includes("INJECTED_FAILURE:before_audit"),
      );
    } finally {
      __setResolveConflictFailurePointForTests(null);
    }

    const conflictRow = await absenceOperationalImpactRepository.findConflictById(
      companyId,
      absenceRequestId,
      conflict.id,
    );
    assert.equal(conflictRow?.status, "OPEN");
  });

  it("7: duplicate attendance-during-absence MessageSid is idempotent", async () => {
    const employeeId = await insertEmployee("Dup Msg Emp", 13);
    const absenceRequestId = await insertApprovedAbsenceStub(employeeId);
    const messageSid = `SM${randomUUID().replace(/-/g, "").slice(0, 32)}`;
    const key = buildAttendanceDuringAbsenceConflictKey({ companyId, messageSid });

    const first = await absenceOperationalImpactRepository.upsertConflict({
      companyId,
      absenceRequestId,
      absenceVersion: 1,
      conflictType: "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE",
      severity: "CRITICAL",
      employeeId,
      sourceMessageSid: messageSid,
      idempotencyKey: key,
      rangeStartAt: new Date(),
      rangeEndAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });
    const second = await absenceOperationalImpactRepository.upsertConflict({
      companyId,
      absenceRequestId,
      absenceVersion: 1,
      conflictType: "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE",
      severity: "CRITICAL",
      employeeId,
      sourceMessageSid: messageSid,
      idempotencyKey: key,
      rangeStartAt: new Date(),
      rangeEndAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    assert.equal(first.id, second.id);

    const pool = getPool();
    const count = await pool
      .request()
      .input("key", sql.NVarChar(200), key)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM absence_operational_conflicts
        WHERE company_id = @companyId AND idempotency_key = @key
      `);
    assert.equal(Number(count.recordset[0].cnt), 1);
  });

  it("6: check-in conflict persists while reconcile job remains PROCESSING", async () => {
    await neutralizeOpenJobs();
    const employeeId = await insertEmployee("Checkin Race Emp", 14);
    const absenceRequestId = await insertApprovedAbsenceStub(employeeId);
    const job = await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId,
      absenceStatus: "APPROVED",
      operation: "APPROVE",
      expectedOperationalImpactVersion: 1,
      enqueueCommandId: `checkin-race-${randomUUID()}`,
    });
    const claimed = await absenceWorkdaySyncJobRepository.claimNextPending(8, {
      leaseOwner: `reconcile-hold-${randomUUID()}`,
      leaseSeconds: 120,
    });
    assert.ok(claimed);
    assert.equal(claimed.id, job.id);

    const messageSid = `SM${randomUUID().replace(/-/g, "").slice(0, 32)}`;
    const key = buildAttendanceDuringAbsenceConflictKey({ companyId, messageSid });
    const conflict = await absenceOperationalImpactRepository.upsertConflict({
      companyId,
      absenceRequestId,
      absenceVersion: 1,
      conflictType: "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE",
      severity: "CRITICAL",
      employeeId,
      sourceMessageSid: messageSid,
      idempotencyKey: key,
      rangeStartAt: new Date(),
      rangeEndAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    const stillProcessing = await absenceWorkdaySyncJobRepository.findById(companyId, job.id);
    assert.equal(stillProcessing?.status, "PROCESSING");

    const conflictRow = await absenceOperationalImpactRepository.findConflictById(
      companyId,
      absenceRequestId,
      conflict.id,
    );
    assert.equal(conflictRow?.status, "OPEN");
    assert.equal(conflictRow?.conflictType, "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE");
    assert.equal(conflictRow?.sourceMessageSid, messageSid);

    const token = absenceWorkdaySyncJobRepository.toLeaseToken(claimed);
    await absenceWorkdaySyncJobRepository.markFailedAttemptWithLease(token, "test-release", 8);
  });
});
