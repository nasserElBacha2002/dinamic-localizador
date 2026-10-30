/**
 * Fase 3 — workday-scoped operational coverage (SQL).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import { WEEKDAYS } from "../../constants/weekday";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  normalizeSqlDateIso,
  resolveCompanyTodayIso,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { getPool } from "../../database/connection";
import { AppError } from "../../errors/app-error";
import { absenceOperationalImpactRepository } from "../../repositories/absence/absence-operational-impact.repository";
import { absenceRequestRepository } from "../../repositories/absence/absence-request.repository";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";
import {
  employeeWorkdayCoverageService,
  __setCoverEmployeeWorkdayFailurePointForTests,
} from "./employee-workday-coverage.service";
import {
  __setSyncAfterCoverageFailurePointForTests,
} from "./absence-workday-coverage-reconciliation.service";
import { operationAssignmentService } from "../operations/operation-assignment.service";
import { operationService } from "../operations/operation.service";
import { operationWorkDateService } from "../operations/operation-work-date.service";
import { recurringWorkdayMaterializationService } from "../workdays/recurring-workday-materialization.service";

const uniquePhone = (n: number): string =>
  `+54911${Date.now().toString().slice(-7)}${n}`;

const allDaysSchedule = WEEKDAYS.map((dayOfWeek) => ({
  dayOfWeek,
  isEnabled: true,
  startTime: "09:00",
  endTime: "18:00",
}));

describeDatabaseIntegration("employee workday coverage phase3", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let adminUserId = "";
  let serviceId = "";
  let absenceTypeId = "";

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
    const user = await pool.request().query(`SELECT TOP 1 id FROM users ORDER BY created_at ASC`);
    adminUserId = String(user.recordset[0]?.id ?? "");
    assert.ok(adminUserId);
    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
      `);
    serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId);
    const type = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM absence_types WHERE company_id = @companyId AND is_active = 1
      `);
    absenceTypeId = String(type.recordset[0]?.id ?? "");
    assert.ok(absenceTypeId);
  });

  after(async () => {
    __setCoverEmployeeWorkdayFailurePointForTests(null);
    __setSyncAfterCoverageFailurePointForTests(null);
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

  const approveAbsence = async (absenceRequestId: string): Promise<void> => {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        UPDATE absence_requests
        SET status = N'APPROVED',
            operational_impact_version = 1,
            reviewed_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
  };

  const upsertWorkdayConflict = async (input: {
    absenceRequestId: string;
    absentEmployeeId: string;
    operationId: string;
    assignmentId: string;
    employeeWorkdayId: string;
    keySuffix: string;
  }) => {
    return absenceOperationalImpactRepository.upsertConflict({
      companyId,
      absenceRequestId: input.absenceRequestId,
      absenceVersion: 1,
      conflictType: "ASSIGNMENT_DURING_ABSENCE",
      severity: "WARNING",
      employeeId: input.absentEmployeeId,
      operationId: input.operationId,
      serviceId,
      assignmentId: input.assignmentId,
      employeeWorkdayId: input.employeeWorkdayId,
      idempotencyKey: `phase3-cov:${input.keySuffix}:${randomUUID()}`,
    });
  };

  const countActiveCoverageEvents = async (employeeWorkdayId: string): Promise<number> => {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        SELECT COUNT(*) AS total
        FROM operation_coverage_events
        WHERE company_id = @companyId
          AND absent_employee_workday_id = @employeeWorkdayId
          AND superseded_at IS NULL
      `);
    return Number(result.recordset[0]?.total ?? 0);
  };

  const countActiveCoverageAssignments = async (
    operationId: string,
    employeeId: string,
  ): Promise<number> => {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT COUNT(*) AS total
        FROM operation_assignments
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND employee_id = @employeeId
          AND cancelled_at IS NULL
          AND assignment_origin = N'COVERAGE'
      `);
    return Number(result.recordset[0]?.total ?? 0);
  };

  const ensurePendingReplacementRequest = async (
    employeeWorkdayId: string,
    absentEmployeeId: string,
  ): Promise<void> => {
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("absentEmployeeId", sql.UniqueIdentifier, absentEmployeeId)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM replacement_requests
          WHERE company_id = @companyId
            AND absent_employee_workday_id = @employeeWorkdayId
            AND status = N'PENDING'
        )
        BEGIN
          INSERT INTO replacement_requests (
            company_id, operation_workday_id, absent_employee_workday_id, absent_employee_id, status
          )
          SELECT ew.company_id, ew.operation_workday_id, ew.id, ew.employee_id, N'PENDING'
          FROM employee_workdays ew
          WHERE ew.company_id = @companyId
            AND ew.id = @employeeWorkdayId
            AND ew.employee_id = @absentEmployeeId;
        END
      `);
  };

  const loadReplacementRequest = async (
    employeeWorkdayId: string,
  ): Promise<{
    status: string;
    resolvedEmployeeId: string | null;
    resolvedAt: string | null;
  } | null> => {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        SELECT TOP 1 status, resolved_employee_id, resolved_at
        FROM replacement_requests
        WHERE company_id = @companyId
          AND absent_employee_workday_id = @employeeWorkdayId
        ORDER BY created_at DESC
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      status: String(row.status),
      resolvedEmployeeId: row.resolved_employee_id ? String(row.resolved_employee_id) : null,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as Date).toISOString() : null,
    };
  };

  const assertCoverFailureState = async (input: {
    operationId: string;
    employeeWorkdayId: string;
    conflictId: string;
    absenceRequestId: string;
    replacementEmployeeId: string;
  }): Promise<void> => {
    assert.equal(await countActiveCoverageEvents(input.employeeWorkdayId), 0);
    assert.equal(
      await countActiveCoverageAssignments(input.operationId, input.replacementEmployeeId),
      0,
    );
    const conflicts = await absenceOperationalImpactRepository.listConflictsByRequest(
      companyId,
      input.absenceRequestId,
    );
    assert.equal(
      conflicts.find((c) => c.id === input.conflictId)?.status,
      "OPEN",
    );
    const request = await loadReplacementRequest(input.employeeWorkdayId);
    if (request) {
      assert.equal(request.status, "PENDING");
      assert.equal(request.resolvedEmployeeId, null);
    }
  };

  const setupRecurringAbsenceWithThreeWorkdays = async () => {
    const today = await resolveCompanyTodayIso(companyId);
    const absentId = await insertEmployee("Phase3 absent", 31);
    const replB = await insertEmployee("Phase3 repl B", 32);
    const replC = await insertEmployee("Phase3 repl C", 33);

    const operation = await operationService.createRecurring(
      companyId,
      {
        operationKind: "RECURRING",
        serviceId,
        validFrom: today,
        scheduleSource: "CUSTOM",
        scheduleDays: allDaysSchedule,
      },
      {
        earlyToleranceMinutes: 60,
        lateToleranceMinutes: 90,
        earlyToleranceSource: "CUSTOM",
        lateToleranceSource: "CUSTOM",
      },
    );
    fixtures.trackOperation(companyId, operation.id);

    const titularAssignment = await operationAssignmentService.assignEmployee(
      companyId,
      operation.id,
      absentId,
      { validFrom: today },
    );
    await recurringWorkdayMaterializationService.materializeOperationHorizon(
      companyId,
      operation.id,
    );

    const pool = getPool();
    const workdayRows = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operation.id)
      .input("employeeId", sql.UniqueIdentifier, absentId)
      .query(`
        SELECT ew.id AS employee_workday_id, CAST(ow.work_date AS DATE) AS work_date
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
        WHERE ew.company_id = @companyId
          AND ow.operation_id = @operationId
          AND ew.employee_id = @employeeId
        ORDER BY ow.work_date ASC
      `);
    assert.ok(workdayRows.recordset.length >= 4);
    const wd1 = workdayRows.recordset[1];
    const wd2 = workdayRows.recordset[2];
    const wd3 = workdayRows.recordset[3];
    const startDate = normalizeSqlDateIso(wd1.work_date);
    const endDate = normalizeSqlDateIso(wd3.work_date);

    const absence = await absenceRequestRepository.create(companyId, {
      employeeId: absentId,
      absenceTypeId,
      startDate,
      endDate,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      totalDays: 3,
      reason: "phase3 multi-workday",
      requestedVia: "ADMIN",
    });
    await approveAbsence(absence.id);

    const c1 = await upsertWorkdayConflict({
      absenceRequestId: absence.id,
      absentEmployeeId: absentId,
      operationId: operation.id,
      assignmentId: titularAssignment.id,
      employeeWorkdayId: String(wd1.employee_workday_id),
      keySuffix: "wd1",
    });
    const c2 = await upsertWorkdayConflict({
      absenceRequestId: absence.id,
      absentEmployeeId: absentId,
      operationId: operation.id,
      assignmentId: titularAssignment.id,
      employeeWorkdayId: String(wd2.employee_workday_id),
      keySuffix: "wd2",
    });
    const c3 = await upsertWorkdayConflict({
      absenceRequestId: absence.id,
      absentEmployeeId: absentId,
      operationId: operation.id,
      assignmentId: titularAssignment.id,
      employeeWorkdayId: String(wd3.employee_workday_id),
      keySuffix: "wd3",
    });

    return {
      operationId: operation.id,
      absentId,
      replB,
      replC,
      titularAssignmentId: titularAssignment.id,
      absenceRequestId: absence.id,
      wd1: { id: String(wd1.employee_workday_id), workDate: startDate, conflictId: c1.id },
      wd2: {
        id: String(wd2.employee_workday_id),
        workDate: normalizeSqlDateIso(wd2.work_date),
        conflictId: c2.id,
      },
      wd3: {
        id: String(wd3.employee_workday_id),
        workDate: endDate,
        conflictId: c3.id,
      },
    };
  };

  it("A multi-workday: independent coverage and conflicts per workday", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();

    await employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
      operationId: fx.operationId,
      employeeWorkdayId: fx.wd1.id,
      replacementEmployeeId: fx.replB,
      replacedAssignmentId: fx.titularAssignmentId,
      replacedEmployeeId: fx.absentId,
      coverageCommandId: `phase3-wd1-${randomUUID()}`,
      sourceType: "MANUAL_COVERAGE",
      absenceRequestId: fx.absenceRequestId,
      absenceConflictId: fx.wd1.conflictId,
    });
    await employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
      operationId: fx.operationId,
      employeeWorkdayId: fx.wd2.id,
      replacementEmployeeId: fx.replC,
      replacedAssignmentId: fx.titularAssignmentId,
      replacedEmployeeId: fx.absentId,
      coverageCommandId: `phase3-wd2-${randomUUID()}`,
      sourceType: "MANUAL_COVERAGE",
      absenceRequestId: fx.absenceRequestId,
      absenceConflictId: fx.wd2.conflictId,
    });

    assert.equal(await countActiveCoverageEvents(fx.wd1.id), 1);
    assert.equal(await countActiveCoverageEvents(fx.wd2.id), 1);
    assert.equal(await countActiveCoverageEvents(fx.wd3.id), 0);

    const impact = await absenceOperationalImpactQueryService.computeImpact(
      companyId,
      fx.absenceRequestId,
    );
    const i1 = impact.workdays.find((w) => w.employeeWorkdayId === fx.wd1.id);
    const i2 = impact.workdays.find((w) => w.employeeWorkdayId === fx.wd2.id);
    const i3 = impact.workdays.find((w) => w.employeeWorkdayId === fx.wd3.id);
    assert.ok(i1?.hasOperationalReplacement);
    assert.equal(i1?.coveredByEmployeeId, fx.replB);
    assert.ok(i2?.hasOperationalReplacement);
    assert.equal(i2?.coveredByEmployeeId, fx.replC);
    assert.equal(i3?.hasOperationalReplacement, false);
    assert.equal(i3?.needsCoverage, true);

    const conflicts = await absenceOperationalImpactRepository.listConflictsByRequest(
      companyId,
      fx.absenceRequestId,
    );
    const byWd = (wdId: string) =>
      conflicts.find(
        (c) => c.employeeWorkdayId === wdId && c.conflictType === "ASSIGNMENT_DURING_ABSENCE",
      );
    assert.equal(byWd(fx.wd1.id)?.status, "RESOLVED");
    assert.equal(byWd(fx.wd2.id)?.status, "RESOLVED");
    assert.equal(byWd(fx.wd3.id)?.status, "OPEN");
  });

  it("reconciliation: covering WD1 does not resolve WD2 conflict", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();
    await employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
      operationId: fx.operationId,
      employeeWorkdayId: fx.wd1.id,
      replacementEmployeeId: fx.replB,
      replacedAssignmentId: fx.titularAssignmentId,
      replacedEmployeeId: fx.absentId,
      coverageCommandId: `phase3-reconcile-${randomUUID()}`,
      sourceType: "MANUAL_COVERAGE",
      absenceRequestId: fx.absenceRequestId,
      absenceConflictId: fx.wd1.conflictId,
    });
    const conflicts = await absenceOperationalImpactRepository.listConflictsByRequest(
      companyId,
      fx.absenceRequestId,
    );
    assert.equal(
      conflicts.find((c) => c.id === fx.wd2.conflictId)?.status,
      "OPEN",
    );
  });

  it("E tampering: WD1 cover with conflict id of WD2 is rejected", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();
    const beforeEvents = await countActiveCoverageEvents(fx.wd1.id);
    await assert.rejects(
      () =>
        employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
          operationId: fx.operationId,
          employeeWorkdayId: fx.wd1.id,
          replacementEmployeeId: fx.replB,
          replacedAssignmentId: fx.titularAssignmentId,
          replacedEmployeeId: fx.absentId,
          coverageCommandId: `phase3-tamper-${randomUUID()}`,
          sourceType: "MANUAL_COVERAGE",
          absenceRequestId: fx.absenceRequestId,
          absenceConflictId: fx.wd2.conflictId,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "ABSENCE_CONFLICT_WORKDAY_MISMATCH",
    );
    assert.equal(await countActiveCoverageEvents(fx.wd1.id), beforeEvents);
  });

  it("C idempotency: same coverageCommandId twice returns one active coverage", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();
    const commandId = `phase3-idem-${randomUUID()}`;
    const first = await employeeWorkdayCoverageService.coverEmployeeWorkday(
      companyId,
      adminUserId,
      {
        operationId: fx.operationId,
        employeeWorkdayId: fx.wd1.id,
        replacementEmployeeId: fx.replB,
        replacedAssignmentId: fx.titularAssignmentId,
        replacedEmployeeId: fx.absentId,
        coverageCommandId: commandId,
        sourceType: "MANUAL_COVERAGE",
        absenceRequestId: fx.absenceRequestId,
        absenceConflictId: fx.wd1.conflictId,
      },
    );
    const second = await employeeWorkdayCoverageService.coverEmployeeWorkday(
      companyId,
      adminUserId,
      {
        operationId: fx.operationId,
        employeeWorkdayId: fx.wd1.id,
        replacementEmployeeId: fx.replB,
        replacedAssignmentId: fx.titularAssignmentId,
        replacedEmployeeId: fx.absentId,
        coverageCommandId: commandId,
        sourceType: "MANUAL_COVERAGE",
        absenceRequestId: fx.absenceRequestId,
        absenceConflictId: fx.wd1.conflictId,
      },
    );
    assert.equal(first.replacementAssignment.id, second.replacementAssignment.id);
    assert.equal(second.idempotent, true);
    assert.equal(await countActiveCoverageEvents(fx.wd1.id), 1);
  });

  it("C command collision: same commandId with different replacement is rejected", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();
    const commandId = `phase3-collision-${randomUUID()}`;
    await employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
      operationId: fx.operationId,
      employeeWorkdayId: fx.wd1.id,
      replacementEmployeeId: fx.replB,
      replacedAssignmentId: fx.titularAssignmentId,
      replacedEmployeeId: fx.absentId,
      coverageCommandId: commandId,
      sourceType: "MANUAL_COVERAGE",
      absenceRequestId: fx.absenceRequestId,
      absenceConflictId: fx.wd1.conflictId,
    });
    await assert.rejects(
      () =>
        employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
          operationId: fx.operationId,
          employeeWorkdayId: fx.wd1.id,
          replacementEmployeeId: fx.replC,
          replacedAssignmentId: fx.titularAssignmentId,
          replacedEmployeeId: fx.absentId,
          coverageCommandId: commandId,
          sourceType: "MANUAL_COVERAGE",
          absenceRequestId: fx.absenceRequestId,
          absenceConflictId: fx.wd1.conflictId,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "COVERAGE_COMMAND_CONFLICT",
    );
  });

  it("D concurrency: only one active coverage for the same workday", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();
    const results = await Promise.allSettled([
      employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
        operationId: fx.operationId,
        employeeWorkdayId: fx.wd1.id,
        replacementEmployeeId: fx.replB,
        replacedAssignmentId: fx.titularAssignmentId,
        replacedEmployeeId: fx.absentId,
        coverageCommandId: `phase3-conc-a-${randomUUID()}`,
        sourceType: "MANUAL_COVERAGE",
        absenceRequestId: fx.absenceRequestId,
        absenceConflictId: fx.wd1.conflictId,
      }),
      employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
        operationId: fx.operationId,
        employeeWorkdayId: fx.wd1.id,
        replacementEmployeeId: fx.replC,
        replacedAssignmentId: fx.titularAssignmentId,
        replacedEmployeeId: fx.absentId,
        coverageCommandId: `phase3-conc-b-${randomUUID()}`,
        sourceType: "MANUAL_COVERAGE",
        absenceRequestId: fx.absenceRequestId,
        absenceConflictId: fx.wd1.conflictId,
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(await countActiveCoverageEvents(fx.wd1.id), 1);
  });

  it("B recurring: titular assignment stays active after covering one workday", async () => {
    const today = await resolveCompanyTodayIso(companyId);
    const absentId = await insertEmployee("Recurring titular", 41);
    const repl = await insertEmployee("Recurring repl", 42);
    const operation = await operationService.createRecurring(
      companyId,
      {
        operationKind: "RECURRING",
        serviceId,
        validFrom: today,
        scheduleSource: "CUSTOM",
        scheduleDays: allDaysSchedule,
      },
      {
        earlyToleranceMinutes: 60,
        lateToleranceMinutes: 90,
        earlyToleranceSource: "CUSTOM",
        lateToleranceSource: "CUSTOM",
      },
    );
    fixtures.trackOperation(companyId, operation.id);
    const titular = await operationAssignmentService.assignEmployee(
      companyId,
      operation.id,
      absentId,
      { validFrom: today },
    );
    await recurringWorkdayMaterializationService.materializeOperationHorizon(
      companyId,
      operation.id,
    );

    const pool = getPool();
    const rows = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operation.id)
      .input("employeeId", sql.UniqueIdentifier, absentId)
      .query(`
        SELECT ew.id AS employee_workday_id, CAST(ow.work_date AS DATE) AS work_date
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
        WHERE ew.company_id = @companyId AND ow.operation_id = @operationId AND ew.employee_id = @employeeId
        ORDER BY ow.work_date ASC
      `);
    const wd10 = rows.recordset[10];
    const wd11 = rows.recordset[11];
    assert.ok(wd10 && wd11);
    const coverDate = normalizeSqlDateIso(wd10.work_date);
    const nextDate = normalizeSqlDateIso(wd11.work_date);

    const absence = await absenceRequestRepository.create(companyId, {
      employeeId: absentId,
      absenceTypeId,
      startDate: coverDate,
      endDate: coverDate,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      totalDays: 1,
      reason: "single day recurring",
      requestedVia: "ADMIN",
    });
    await approveAbsence(absence.id);
    const conflict = await upsertWorkdayConflict({
      absenceRequestId: absence.id,
      absentEmployeeId: absentId,
      operationId: operation.id,
      assignmentId: titular.id,
      employeeWorkdayId: String(wd10.employee_workday_id),
      keySuffix: "wd10",
    });

    await employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
      operationId: operation.id,
      employeeWorkdayId: String(wd10.employee_workday_id),
      replacementEmployeeId: repl,
      replacedAssignmentId: titular.id,
      replacedEmployeeId: absentId,
      coverageCommandId: `phase3-rec-${randomUUID()}`,
      sourceType: "MANUAL_COVERAGE",
      absenceRequestId: absence.id,
      absenceConflictId: conflict.id,
    });

    const titularRow = await pool
      .request()
      .input("id", sql.UniqueIdentifier, titular.id)
      .query(`SELECT cancelled_at FROM operation_assignments WHERE id = @id`);
    assert.equal(titularRow.recordset[0]?.cancelled_at, null);

    const expectations = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operation.id)
      .input("employeeId", sql.UniqueIdentifier, absentId)
      .query(`
        SELECT CAST(ow.work_date AS DATE) AS work_date, ew.expectation_status, ew.operation_assignment_id
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
        WHERE ew.company_id = @companyId AND ow.operation_id = @operationId AND ew.employee_id = @employeeId
      `);
    const row10 = expectations.recordset.find(
      (r) => normalizeSqlDateIso(r.work_date) === coverDate,
    );
    const row11 = expectations.recordset.find(
      (r) => normalizeSqlDateIso(r.work_date) === nextDate,
    );
    assert.equal(row10?.expectation_status, "CANCELLED");
    assert.equal(row11?.expectation_status, "EXPECTED");
    assert.equal(String(row11?.operation_assignment_id), titular.id);

    const replOn11 = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operation.id)
      .input("employeeId", sql.UniqueIdentifier, repl)
      .input("workDate", sql.Date, nextDate)
      .query(`
        SELECT TOP 1 ew.id
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
        WHERE ow.operation_id = @operationId AND ew.employee_id = @employeeId AND ow.work_date = @workDate
      `);
    assert.equal(replOn11.recordset.length, 0);
  });

  it("F availability: inactive replacement is rejected", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, fx.replB)
      .query(`UPDATE employees SET active = 0 WHERE id = @id`);
    await assert.rejects(
      () =>
        employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
          operationId: fx.operationId,
          employeeWorkdayId: fx.wd1.id,
          replacementEmployeeId: fx.replB,
          replacedAssignmentId: fx.titularAssignmentId,
          replacedEmployeeId: fx.absentId,
          coverageCommandId: `phase3-inactive-${randomUUID()}`,
          sourceType: "MANUAL_COVERAGE",
          absenceRequestId: fx.absenceRequestId,
          absenceConflictId: fx.wd1.conflictId,
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPLACEMENT_INVALID",
    );
  });

  it("F availability: absent employee cannot be replacement", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();
    await assert.rejects(
      () =>
        employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
          operationId: fx.operationId,
          employeeWorkdayId: fx.wd1.id,
          replacementEmployeeId: fx.absentId,
          replacedAssignmentId: fx.titularAssignmentId,
          replacedEmployeeId: fx.absentId,
          coverageCommandId: `phase3-same-${randomUUID()}`,
          sourceType: "MANUAL_COVERAGE",
          absenceRequestId: fx.absenceRequestId,
          absenceConflictId: fx.wd1.conflictId,
        }),
      (error: unknown) => error instanceof AppError && error.code === "COVERAGE_SAME_EMPLOYEE",
    );
  });

  it("G cancel coverage reopens operational need and replacement request", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();
    await ensurePendingReplacementRequest(fx.wd1.id, fx.absentId);
    const covered = await employeeWorkdayCoverageService.coverEmployeeWorkday(
      companyId,
      adminUserId,
      {
        operationId: fx.operationId,
        employeeWorkdayId: fx.wd1.id,
        replacementEmployeeId: fx.replB,
        replacedAssignmentId: fx.titularAssignmentId,
        replacedEmployeeId: fx.absentId,
        coverageCommandId: `phase3-cancel-${randomUUID()}`,
        sourceType: "MANUAL_COVERAGE",
        absenceRequestId: fx.absenceRequestId,
        absenceConflictId: fx.wd1.conflictId,
      },
    );
    const coveredRequest = await loadReplacementRequest(fx.wd1.id);
    assert.equal(coveredRequest?.status, "COVERED");
    assert.equal(coveredRequest?.resolvedEmployeeId, fx.replB);

    const impactBefore = await absenceOperationalImpactQueryService.computeImpact(
      companyId,
      fx.absenceRequestId,
    );
    const wdBefore = impactBefore.workdays.find((w) => w.employeeWorkdayId === fx.wd1.id);
    assert.equal(wdBefore?.hasOperationalReplacement, true);

    await operationAssignmentService.cancelAssignment(
      companyId,
      fx.operationId,
      covered.replacementAssignment.id,
      adminUserId,
    );

    const impactAfter = await absenceOperationalImpactQueryService.computeImpact(
      companyId,
      fx.absenceRequestId,
    );
    const wdAfter = impactAfter.workdays.find((w) => w.employeeWorkdayId === fx.wd1.id);
    assert.equal(wdAfter?.hasOperationalReplacement, false);
    assert.equal(wdAfter?.needsCoverage, true);

    const reopened = await loadReplacementRequest(fx.wd1.id);
    assert.equal(reopened?.status, "PENDING");
    assert.equal(reopened?.resolvedEmployeeId, null);
    assert.equal(reopened?.resolvedAt, null);
  });

  const atomicityFailureCases: Array<{
    label: string;
    activate: () => void;
    deactivate: () => void;
    workdayKey: "wd2" | "wd1";
    replacementKey: "replC" | "replB";
    conflictKey: "wd2" | "wd1";
  }> = [
    {
      label: "after_replacement_assignment",
      activate: () => __setCoverEmployeeWorkdayFailurePointForTests("after_replacement_assignment"),
      deactivate: () => __setCoverEmployeeWorkdayFailurePointForTests(null),
      workdayKey: "wd2",
      replacementKey: "replC",
      conflictKey: "wd2",
    },
    {
      label: "after_coverage_event",
      activate: () => __setCoverEmployeeWorkdayFailurePointForTests("after_coverage_event"),
      deactivate: () => __setCoverEmployeeWorkdayFailurePointForTests(null),
      workdayKey: "wd2",
      replacementKey: "replC",
      conflictKey: "wd2",
    },
    {
      label: "before_reconcile",
      activate: () => __setCoverEmployeeWorkdayFailurePointForTests("before_reconcile"),
      deactivate: () => __setCoverEmployeeWorkdayFailurePointForTests(null),
      workdayKey: "wd2",
      replacementKey: "replC",
      conflictKey: "wd2",
    },
    {
      label: "before_resolve_conflicts",
      activate: () => __setSyncAfterCoverageFailurePointForTests("before_resolve_conflicts"),
      deactivate: () => __setSyncAfterCoverageFailurePointForTests(null),
      workdayKey: "wd1",
      replacementKey: "replB",
      conflictKey: "wd1",
    },
    {
      label: "before_mark_covered",
      activate: () => __setSyncAfterCoverageFailurePointForTests("before_mark_covered"),
      deactivate: () => __setSyncAfterCoverageFailurePointForTests(null),
      workdayKey: "wd2",
      replacementKey: "replC",
      conflictKey: "wd2",
    },
  ];

  for (const failureCase of atomicityFailureCases) {
    it(`H atomicity rolls back on ${failureCase.label}`, async () => {
      const fx = await setupRecurringAbsenceWithThreeWorkdays();
      const employeeWorkdayId = fx[failureCase.workdayKey].id;
      const replacementEmployeeId = fx[failureCase.replacementKey];
      const conflictId = fx[failureCase.conflictKey].conflictId;
      await ensurePendingReplacementRequest(employeeWorkdayId, fx.absentId);
      failureCase.activate();
      try {
        await assert.rejects(
          () =>
            employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
              operationId: fx.operationId,
              employeeWorkdayId,
              replacementEmployeeId,
              replacedAssignmentId: fx.titularAssignmentId,
              replacedEmployeeId: fx.absentId,
              coverageCommandId: `phase3-atomic-${failureCase.label}-${randomUUID()}`,
              sourceType: "MANUAL_COVERAGE",
              absenceRequestId: fx.absenceRequestId,
              absenceConflictId: conflictId,
            }),
          (error: unknown) =>
            error instanceof Error && error.message.includes("INJECTED_FAILURE"),
        );
      } finally {
        failureCase.deactivate();
      }
      await assertCoverFailureState({
        operationId: fx.operationId,
        employeeWorkdayId,
        conflictId,
        absenceRequestId: fx.absenceRequestId,
        replacementEmployeeId,
      });
    });
  }

  it("F availability: overlapping assignment rejects coverage", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();
    await operationAssignmentService.assignEmployee(
      companyId,
      fx.operationId,
      fx.replB,
      { validFrom: fx.wd1.workDate, validUntil: fx.wd1.workDate },
    );
    const beforeEvents = await countActiveCoverageEvents(fx.wd1.id);
    await assert.rejects(
      () =>
        employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
          operationId: fx.operationId,
          employeeWorkdayId: fx.wd1.id,
          replacementEmployeeId: fx.replB,
          replacedAssignmentId: fx.titularAssignmentId,
          replacedEmployeeId: fx.absentId,
          coverageCommandId: `phase3-overlap-${randomUUID()}`,
          sourceType: "MANUAL_COVERAGE",
          absenceRequestId: fx.absenceRequestId,
          absenceConflictId: fx.wd1.conflictId,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        (error.code === "ASSIGNMENT_PERIOD_OVERLAP" || error.code === "REPLACEMENT_UNAVAILABLE"),
    );
    assert.equal(await countActiveCoverageEvents(fx.wd1.id), beforeEvents);
  });

  it("F availability: replacement with approved absence rejects coverage", async () => {
    const fx = await setupRecurringAbsenceWithThreeWorkdays();
    const replAbsence = await absenceRequestRepository.create(companyId, {
      employeeId: fx.replC,
      absenceTypeId,
      startDate: fx.wd1.workDate,
      endDate: fx.wd1.workDate,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      totalDays: 1,
      reason: "replacement absent",
      requestedVia: "ADMIN",
    });
    await approveAbsence(replAbsence.id);
    await assert.rejects(
      () =>
        employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
          operationId: fx.operationId,
          employeeWorkdayId: fx.wd1.id,
          replacementEmployeeId: fx.replC,
          replacedAssignmentId: fx.titularAssignmentId,
          replacedEmployeeId: fx.absentId,
          coverageCommandId: `phase3-repl-absence-${randomUUID()}`,
          sourceType: "MANUAL_COVERAGE",
          absenceRequestId: fx.absenceRequestId,
          absenceConflictId: fx.wd1.conflictId,
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPLACEMENT_UNAVAILABLE",
    );
    assert.equal(await countActiveCoverageEvents(fx.wd1.id), 0);
  });

  it("I overnight: availability uses full expected interval", async () => {
    const pool = getPool();
    const uniqueDayOffset = 60 + Math.floor(Math.random() * 400);
    const start = new Date(Date.now() + uniqueDayOffset * 24 * 60 * 60 * 1000);
    start.setUTCHours(22, 0, 0, 0);
    const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
    const absentId = await insertEmployee("Overnight absent", 51);
    const repl = await insertEmployee("Overnight repl", 52);
    const op = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("startAt", sql.DateTime2, start)
      .input("endAt", sql.DateTime2, end)
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
      absentId,
      { validFrom: workDate, validUntil: workDate },
    );
    const absence = await absenceRequestRepository.create(companyId, {
      employeeId: absentId,
      absenceTypeId,
      startDate: workDate,
      endDate: workDate,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      totalDays: 1,
      reason: "overnight",
      requestedVia: "ADMIN",
    });
    await approveAbsence(absence.id);
    const ew = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, absentId)
      .query(`
        SELECT TOP 1 ew.id
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
        WHERE ew.company_id = @companyId AND ow.operation_id = @operationId AND ew.employee_id = @employeeId
      `);
    const employeeWorkdayId = String(ew.recordset[0]?.id ?? "");
    assert.ok(employeeWorkdayId);
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("startAt", sql.DateTime2, start)
      .input("endAt", sql.DateTime2, end)
      .query(`
        UPDATE ow
        SET ow.expected_start_at = @startAt, ow.expected_end_at = @endAt
        FROM operation_workdays ow
        INNER JOIN employee_workdays ew ON ew.operation_workday_id = ow.id
        WHERE ew.company_id = @companyId AND ew.id = @employeeWorkdayId
      `);
    const conflict = await upsertWorkdayConflict({
      absenceRequestId: absence.id,
      absentEmployeeId: absentId,
      operationId,
      assignmentId: assignment.id,
      employeeWorkdayId,
      keySuffix: "overnight",
    });
    await employeeWorkdayCoverageService.coverEmployeeWorkday(companyId, adminUserId, {
      operationId,
      employeeWorkdayId,
      replacementEmployeeId: repl,
      replacedAssignmentId: assignment.id,
      replacedEmployeeId: absentId,
      coverageCommandId: `phase3-overnight-${randomUUID()}`,
      sourceType: "MANUAL_COVERAGE",
      absenceRequestId: absence.id,
      absenceConflictId: conflict.id,
    });
    assert.equal(await countActiveCoverageEvents(employeeWorkdayId), 1);
  });
});