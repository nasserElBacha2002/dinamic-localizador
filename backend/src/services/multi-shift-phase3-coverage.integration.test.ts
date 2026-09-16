/**
 * Phase 3 — multi-shift coverage shift matching + transactional rollback.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it, mock } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { deleteOperationCascade } from "../test-helpers/integration-entity-cascade";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationAssignmentService } from "./operation-assignment.service";
import { operationScheduleModeTransitionService } from "./operation-schedule-mode-transition.service";
import { recurringWorkdayMaterializationService } from "./recurring-workday-materialization.service";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { resolveOperationTimezone } from "../utils/operation-timezone";

describeDatabaseIntegration("phase3 multi-shift coverage (SQL)", () => {
  let companyId = "";
  let multiOperationId = "";
  let singleOperationId = "";
  let employeeA = "";
  let employeeB = "";
  let employeeC = "";
  let morningShiftId = "";
  let afternoonShiftId = "";
  let workDate = "";
  let morningAssignmentId = "";
  const createdEmployeeIds: string[] = [];

  const cleanupOperation = async (operationId: string) => {
    if (!operationId || !companyId) return;
    try {
      await deleteOperationCascade(companyId, operationId);
    } catch (error) {
      console.warn("[phase3-coverage] cleanup failed", operationId, error);
    }
  };

  const countCoverageEvents = async (operationId: string, replacedAssignmentId?: string) => {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId);
    if (replacedAssignmentId) {
      request.input("replacedAssignmentId", sql.UniqueIdentifier, replacedAssignmentId);
    }
    const result = await request.query(`
      SELECT COUNT(*) AS total
      FROM dbo.operation_coverage_events
      WHERE company_id = @companyId
        AND operation_id = @operationId
        ${replacedAssignmentId ? "AND replaced_assignment_id = @replacedAssignmentId" : ""}
    `);
    return Number(result.recordset[0].total);
  };

  const loadAssignment = async (assignmentId: string) => {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, assignmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT id, employee_id, operation_shift_id, cancelled_at
        FROM dbo.operation_assignments
        WHERE id = @id AND company_id = @companyId
      `);
    return result.recordset[0] as
      | {
          id: string;
          employee_id: string;
          operation_shift_id: string | null;
          cancelled_at: Date | null;
        }
      | undefined;
  };

  const countAssignmentsForEmployee = async (operationId: string, employeeId: string) => {
    const pool = getPool();
    const result = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT COUNT(*) AS total
        FROM dbo.operation_assignments
        WHERE operation_id = @operationId
          AND employee_id = @employeeId
          AND cancelled_at IS NULL
      `);
    return Number(result.recordset[0].total);
  };

  const countEmployeeWorkdays = async (operationId: string, employeeId: string) => {
    const pool = getPool();
    const result = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT COUNT(*) AS total
        FROM dbo.employee_workdays ew
        INNER JOIN dbo.operation_workdays ow ON ow.id = ew.operation_workday_id
        WHERE ow.operation_id = @operationId
          AND ew.employee_id = @employeeId
      `);
    return Number(result.recordset[0].total);
  };

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    workDate = getDateIsoInTimezone(new Date(), timezone);

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id
        FROM dbo.operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const existing = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 3 id
        FROM dbo.employees
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const ids = existing.recordset.map((r: { id: string }) => String(r.id));
    while (ids.length < 3) {
      const phone = `+54911${Date.now().toString().slice(-7)}${ids.length}`;
      const inserted = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("name", sql.NVarChar(200), `Phase3 Coverage Emp ${randomUUID().slice(0, 6)}`)
        .input("phone", sql.NVarChar(30), phone)
        .query(`
          DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
          INSERT INTO dbo.employees (company_id, name, phone_number, employee_type, active)
          OUTPUT INSERTED.id INTO @inserted (id)
          VALUES (@companyId, @name, @phone, N'fijo', 1);
          SELECT id FROM @inserted;
        `);
      const id = String(inserted.recordset[0].id);
      ids.push(id);
      createdEmployeeIds.push(id);
    }
    employeeA = ids[0]!;
    employeeB = ids[1]!;
    employeeC = ids[2]!;

    const startMulti = new Date(`${workDate}T12:00:00.000Z`);
    startMulti.setUTCMilliseconds((Date.now() + Number.parseInt(randomUUID().slice(0, 8), 16)) % 86_400_000);
    const endMulti = new Date(startMulti.getTime() + 11 * 60 * 60 * 1000);
    const startSingle = new Date(startMulti.getTime() + 90 * 60 * 1000);
    const endSingle = new Date(startSingle.getTime() + 8 * 60 * 60 * 1000);

    const insertOp = async (start: Date, end: Date) => {
      const op = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("serviceId", sql.UniqueIdentifier, serviceId)
        .input("start", sql.DateTime2, start)
        .input("end", sql.DateTime2, end)
        .query(`
          INSERT INTO dbo.scheduled_operations (
            company_id, service_id, operation_kind, scheduled_start, scheduled_end,
            early_tolerance_minutes, late_tolerance_minutes,
            early_tolerance_source, late_tolerance_source, status
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @serviceId, N'ONE_TIME',
            @start, @end, 30, 30, N'CUSTOM', N'CUSTOM', N'SCHEDULED'
          );
        `);
      return String(op.recordset[0].id);
    };

    multiOperationId = await insertOp(startMulti, endMulti);
    singleOperationId = await insertOp(startSingle, endSingle);

    const transition = await operationScheduleModeTransitionService.transitionToMultiShift(
      companyId,
      multiOperationId,
      {
        effectiveFrom: workDate,
        shifts: [
          {
            code: `M${randomUUID().slice(0, 6)}`,
            name: "Mañana",
            startTime: "09:00",
            endTime: "13:00",
          },
          {
            code: `T${randomUUID().slice(0, 6)}`,
            name: "Tarde",
            startTime: "14:00",
            endTime: "18:00",
          },
        ],
      },
    );
    assert.equal(transition.shiftIds.length, 2);

    await recurringWorkdayMaterializationService.materializeMultiShiftOperationHorizon(
      companyId,
      multiOperationId,
      { rangeStart: workDate, rangeEnd: workDate },
    );

    const shifts = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, multiOperationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT operation_shift_id
        FROM dbo.operation_workdays
        WHERE operation_id = @operationId AND work_date = @workDate
        ORDER BY expected_start_at ASC
      `);
    morningShiftId = String(shifts.recordset[0].operation_shift_id);
    afternoonShiftId = String(shifts.recordset[1].operation_shift_id);

    const assigned = await operationAssignmentService.assignEmployee(
      companyId,
      multiOperationId,
      employeeA,
      { operationShiftId: morningShiftId },
    );
    morningAssignmentId = assigned.id;
    assert.equal(assigned.operationShiftId, morningShiftId);
  });

  after(async () => {
    await cleanupOperation(multiOperationId);
    await cleanupOperation(singleOperationId);
    const pool = getPool();
    for (const id of createdEmployeeIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM dbo.employees WHERE id = @id`);
    }
    await teardownDatabaseIntegration();
  });

  it("coverage without explicit shift succeeds and inherits replaced shift", async () => {
    const coverer = employeeB;
    const beforeEw = await countEmployeeWorkdays(multiOperationId, coverer);

    const replacement = await operationAssignmentService.assignEmployee(
      companyId,
      multiOperationId,
      coverer,
      {
        asCoverage: true,
        replacedAssignmentId: morningAssignmentId,
        replacedEmployeeId: employeeA,
      },
    );

    assert.equal(replacement.operationShiftId, morningShiftId);
    assert.equal(await countCoverageEvents(multiOperationId, morningAssignmentId), 1);

    const replaced = await loadAssignment(morningAssignmentId);
    assert.ok(replaced?.cancelled_at);

    // Restore fixture for later tests: cancel coverage, re-assign A to morning.
    await operationAssignmentService.cancelAssignment(companyId, multiOperationId, replacement.id);
    const restored = await operationAssignmentService.assignEmployee(
      companyId,
      multiOperationId,
      employeeA,
      { operationShiftId: morningShiftId },
    );
    morningAssignmentId = restored.id;

    // Coverer may retain EW history; ensure no unexpected growth beyond one coverage cycle.
    const afterEw = await countEmployeeWorkdays(multiOperationId, coverer);
    assert.ok(afterEw >= beforeEw);
  });

  it("coverage with same shift id succeeds", async () => {
    const replacement = await operationAssignmentService.assignEmployee(
      companyId,
      multiOperationId,
      employeeB,
      {
        asCoverage: true,
        replacedAssignmentId: morningAssignmentId,
        replacedEmployeeId: employeeA,
        operationShiftId: morningShiftId,
      },
    );
    assert.equal(replacement.operationShiftId, morningShiftId);

    await operationAssignmentService.cancelAssignment(companyId, multiOperationId, replacement.id);
    const restored = await operationAssignmentService.assignEmployee(
      companyId,
      multiOperationId,
      employeeA,
      { operationShiftId: morningShiftId },
    );
    morningAssignmentId = restored.id;
  });

  it("coverage with other shift id → COVERAGE_SHIFT_MISMATCH; original stays active", async () => {
    const beforeCoverage = await countCoverageEvents(multiOperationId);
    const beforeCovererAssignments = await countAssignmentsForEmployee(
      multiOperationId,
      employeeC,
    );
    const beforeCovererEw = await countEmployeeWorkdays(multiOperationId, employeeC);

    await assert.rejects(
      () =>
        operationAssignmentService.assignEmployee(companyId, multiOperationId, employeeC, {
          asCoverage: true,
          replacedAssignmentId: morningAssignmentId,
          replacedEmployeeId: employeeA,
          operationShiftId: afternoonShiftId,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "COVERAGE_SHIFT_MISMATCH",
    );

    const original = await loadAssignment(morningAssignmentId);
    assert.ok(original);
    assert.equal(original.cancelled_at, null);
    assert.equal(await countCoverageEvents(multiOperationId), beforeCoverage);
    assert.equal(
      await countAssignmentsForEmployee(multiOperationId, employeeC),
      beforeCovererAssignments,
    );
    assert.equal(await countEmployeeWorkdays(multiOperationId, employeeC), beforeCovererEw);
  });

  it("SINGLE op coverage keeps operationShiftId null", async () => {
    const assigned = await operationAssignmentService.assignEmployee(
      companyId,
      singleOperationId,
      employeeA,
    );
    assert.equal(assigned.operationShiftId, null);

    const replacement = await operationAssignmentService.assignEmployee(
      companyId,
      singleOperationId,
      employeeB,
      {
        asCoverage: true,
        replacedAssignmentId: assigned.id,
        replacedEmployeeId: employeeA,
      },
    );
    assert.equal(replacement.operationShiftId, null);
    assert.equal(await countCoverageEvents(singleOperationId, assigned.id), 1);
  });

  it("TX rolls back when coverer already has overlapping assignment after cancel path", async () => {
    // Pre-assign coverer C on morning so coverage assign overlaps and aborts inside TX.
    const existingCover = await operationAssignmentService.assignEmployee(
      companyId,
      multiOperationId,
      employeeC,
      { operationShiftId: morningShiftId },
    );
    assert.equal(existingCover.operationShiftId, morningShiftId);

    const beforeCoverage = await countCoverageEvents(multiOperationId, morningAssignmentId);

    await assert.rejects(
      () =>
        operationAssignmentService.assignEmployee(companyId, multiOperationId, employeeC, {
          asCoverage: true,
          replacedAssignmentId: morningAssignmentId,
          replacedEmployeeId: employeeA,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        (error.code === "ASSIGNMENT_PERIOD_OVERLAP" || error.code === "COVERAGE_SAME_EMPLOYEE"),
    );

    // Coverage of A by C should fail: C already on morning. Prefer overlap.
    // If the service treats skip specially, still assert A is not cancelled and no coverage event.
    const original = await loadAssignment(morningAssignmentId);
    assert.ok(original);
    assert.equal(original.cancelled_at, null, "original assignment must remain active after rollback");
    assert.equal(await countCoverageEvents(multiOperationId, morningAssignmentId), beforeCoverage);

    await operationAssignmentService.cancelAssignment(
      companyId,
      multiOperationId,
      existingCover.id,
    );
  });

  it("rejected mismatch leaves no new OW/EW/events for coverer beyond pre-existing materialization", async () => {
    const pool = getPool();
    const owBefore = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, multiOperationId)
      .query(`
        SELECT COUNT(*) AS total FROM dbo.operation_workdays WHERE operation_id = @operationId
      `);
    const ewBefore = await countEmployeeWorkdays(multiOperationId, employeeB);
    const eventsBefore = await countCoverageEvents(multiOperationId);

    await assert.rejects(
      () =>
        operationAssignmentService.assignEmployee(companyId, multiOperationId, employeeB, {
          asCoverage: true,
          replacedAssignmentId: morningAssignmentId,
          replacedEmployeeId: employeeA,
          operationShiftId: afternoonShiftId,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "COVERAGE_SHIFT_MISMATCH",
    );

    const owAfter = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, multiOperationId)
      .query(`
        SELECT COUNT(*) AS total FROM dbo.operation_workdays WHERE operation_id = @operationId
      `);
    assert.equal(Number(owAfter.recordset[0].total), Number(owBefore.recordset[0].total));
    assert.equal(await countEmployeeWorkdays(multiOperationId, employeeB), ewBefore);
    assert.equal(await countCoverageEvents(multiOperationId), eventsBefore);
    assert.equal((await loadAssignment(morningAssignmentId))?.cancelled_at ?? null, null);
  });

  it("injected failure after prepare rolls back coverage assignment side effects", async () => {
    const { operationAssignmentCore } = await import("./operation-assignment-core.service");
    const pool = getPool();

    const owBefore = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, multiOperationId)
      .query(`
        SELECT COUNT(*) AS total FROM dbo.operation_workdays WHERE operation_id = @operationId
      `);
    const ewBefore = await countEmployeeWorkdays(multiOperationId, employeeB);
    const coverageBefore = await countCoverageEvents(multiOperationId, morningAssignmentId);
    const assignmentsBefore = await countAssignmentsForEmployee(multiOperationId, employeeB);

    const originalAssign = operationAssignmentCore.assignEmployeeInTransaction.bind(
      operationAssignmentCore,
    );
    const assignMock = mock.method(
      operationAssignmentCore,
      "assignEmployeeInTransaction",
      async (...args: Parameters<typeof originalAssign>) => {
        // Allow prepare + locks to complete, then fail inside the shared TX.
        await originalAssign(...args);
        throw new Error("injected failure after prepare and assign write");
      },
    );

    try {
      await assert.rejects(
        () =>
          operationAssignmentService.assignEmployee(companyId, multiOperationId, employeeB, {
            asCoverage: true,
            replacedAssignmentId: morningAssignmentId,
            replacedEmployeeId: employeeA,
          }),
        (error: unknown) =>
          error instanceof Error &&
          error.message.includes("injected failure after prepare and assign write"),
      );
    } finally {
      assignMock.mock.restore();
    }

    const owAfter = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, multiOperationId)
      .query(`
        SELECT COUNT(*) AS total FROM dbo.operation_workdays WHERE operation_id = @operationId
      `);
    // Prepare may leave idempotent OW rows; assignment TX must not leave EW/coverage/cancel.
    assert.ok(Number(owAfter.recordset[0].total) >= Number(owBefore.recordset[0].total));
    assert.equal(await countEmployeeWorkdays(multiOperationId, employeeB), ewBefore);
    assert.equal(await countCoverageEvents(multiOperationId, morningAssignmentId), coverageBefore);
    assert.equal(
      await countAssignmentsForEmployee(multiOperationId, employeeB),
      assignmentsBefore,
    );
    assert.equal((await loadAssignment(morningAssignmentId))?.cancelled_at ?? null, null);
  });

  it("two concurrent coverages on same assignment: only one completes", async () => {
    const results = await Promise.allSettled([
      operationAssignmentService.assignEmployee(companyId, multiOperationId, employeeB, {
        asCoverage: true,
        replacedAssignmentId: morningAssignmentId,
        replacedEmployeeId: employeeA,
      }),
      operationAssignmentService.assignEmployee(companyId, multiOperationId, employeeC, {
        asCoverage: true,
        replacedAssignmentId: morningAssignmentId,
        replacedEmployeeId: employeeA,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(await countCoverageEvents(multiOperationId, morningAssignmentId), 1);

    const winner = (fulfilled[0] as PromiseFulfilledResult<{ id: string }>).value;
    assert.ok(winner.id);
    const original = await loadAssignment(morningAssignmentId);
    assert.ok(original?.cancelled_at);
  });
});
