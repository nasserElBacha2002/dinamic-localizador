import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import {
  applySqlScriptInTransaction,
  stripLegacyDatabaseUse,
  splitBatches,
} from "../database/run-migrations";
import { AppError } from "../errors/app-error";
import { listHybridShiftScheduleStates } from "../repositories/operation-shift-audit.repository";
import { operationShiftFoundationService } from "../services/operation-shift-foundation.service";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";

const ROOT = join(process.cwd(), "..");
const MIGRATION_127 = join(ROOT, "database/migrations/127_operation_shifts_foundation.sql");
const MIGRATION_128 = join(
  ROOT,
  "database/migrations/128_operation_shifts_uniqueness_atomic_repair.sql",
);
const MIGRATION_129 = join(ROOT, "database/migrations/129_operation_shifts_versioned_core.sql");
const MIGRATION_130 = join(
  ROOT,
  "database/migrations/130_workday_cancellation_reason_exception.sql",
);
const ROLLBACK_127 = join(
  ROOT,
  "database/migrations/rollback/127_operation_shifts_foundation_rollback.sql",
);

const isPhase2Versioned = async (): Promise<boolean> => {
  const pool = getPool();
  const result = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID(N'dbo.operation_shift_versions', N'U') IS NULL THEN 0 ELSE 1 END AS present
  `);
  return Boolean(result.recordset[0]?.present);
};

type SchemaFingerprint = {
  hasScheduleMode: boolean;
  hasLegacyUq: boolean;
  hasSingleUx: boolean;
  hasMultiUx: boolean;
  hasTemplatesTable: boolean;
  hasShiftsTable: boolean;
  hasWdShiftCol: boolean;
  hasAsgShiftCol: boolean;
  hasWdShiftFk: boolean;
};

const readFingerprint = async (): Promise<SchemaFingerprint> => {
  const pool = getPool();
  const result = await pool.request().query(`
    SELECT
      CASE WHEN COL_LENGTH(N'dbo.scheduled_operations', N'schedule_mode') IS NULL THEN 0 ELSE 1 END AS has_schedule_mode,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.key_constraints
        WHERE name = N'UQ_operation_workdays_operation_work_date'
          AND parent_object_id = OBJECT_ID(N'dbo.operation_workdays')
      ) OR EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_operation_workdays_operation_work_date'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
      ) THEN 1 ELSE 0 END AS has_legacy_uq,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_operation_workdays_single_op_date'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
      ) THEN 1 ELSE 0 END AS has_single_ux,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_operation_workdays_multi_op_date_shift'
          AND object_id = OBJECT_ID(N'dbo.operation_workdays')
      ) THEN 1 ELSE 0 END AS has_multi_ux,
      CASE WHEN OBJECT_ID(N'dbo.company_shift_templates', N'U') IS NULL THEN 0 ELSE 1 END AS has_templates,
      CASE WHEN OBJECT_ID(N'dbo.operation_shifts', N'U') IS NULL THEN 0 ELSE 1 END AS has_shifts,
      CASE WHEN COL_LENGTH(N'dbo.operation_workdays', N'operation_shift_id') IS NULL THEN 0 ELSE 1 END AS has_wd_shift,
      CASE WHEN COL_LENGTH(N'dbo.operation_assignments', N'operation_shift_id') IS NULL THEN 0 ELSE 1 END AS has_asg_shift,
      CASE WHEN EXISTS (
        SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_operation_workdays_shift_tenant'
      ) THEN 1 ELSE 0 END AS has_wd_fk;
  `);
  const row = result.recordset[0];
  return {
    hasScheduleMode: Boolean(row.has_schedule_mode),
    hasLegacyUq: Boolean(row.has_legacy_uq),
    hasSingleUx: Boolean(row.has_single_ux),
    hasMultiUx: Boolean(row.has_multi_ux),
    hasTemplatesTable: Boolean(row.has_templates),
    hasShiftsTable: Boolean(row.has_shifts),
    hasWdShiftCol: Boolean(row.has_wd_shift),
    hasAsgShiftCol: Boolean(row.has_asg_shift),
    hasWdShiftFk: Boolean(row.has_wd_fk),
  };
};

const assertPhase1SchemaPresent = (fp: SchemaFingerprint): void => {
  assert.equal(fp.hasScheduleMode, true);
  assert.equal(fp.hasSingleUx, true);
  assert.equal(fp.hasMultiUx, true);
  assert.equal(fp.hasLegacyUq, false);
  assert.equal(fp.hasTemplatesTable, true);
  assert.equal(fp.hasShiftsTable, true);
  assert.equal(fp.hasWdShiftCol, true);
  assert.equal(fp.hasAsgShiftCol, true);
  assert.equal(fp.hasWdShiftFk, true);
};

const assertPrePhase1Schema = (fp: SchemaFingerprint): void => {
  assert.equal(fp.hasScheduleMode, false);
  assert.equal(fp.hasSingleUx, false);
  assert.equal(fp.hasMultiUx, false);
  assert.equal(fp.hasLegacyUq, true);
  assert.equal(fp.hasTemplatesTable, false);
  assert.equal(fp.hasShiftsTable, false);
  assert.equal(fp.hasWdShiftCol, false);
  assert.equal(fp.hasAsgShiftCol, false);
};

const executeSqlFileAutocommit = async (path: string): Promise<void> => {
  const pool = getPool();
  const script = readFileSync(path, "utf8");
  for (const batch of splitBatches(script)) {
    const normalized = stripLegacyDatabaseUse(batch);
    if (!normalized) {
      continue;
    }
    await pool.request().query(normalized);
  }
};

const phase1CatalogEmpty = async (): Promise<boolean> => {
  const pool = getPool();
  const result = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.company_shift_templates) AS templates,
      (SELECT COUNT(*) FROM dbo.operation_shifts) AS shifts,
      (SELECT COUNT(*) FROM dbo.operation_workdays WHERE operation_shift_id IS NOT NULL) AS wd,
      (SELECT COUNT(*) FROM dbo.operation_assignments WHERE operation_shift_id IS NOT NULL) AS asg;
  `);
  const row = result.recordset[0];
  return (
    Number(row.templates) === 0 &&
    Number(row.shifts) === 0 &&
    Number(row.wd) === 0 &&
    Number(row.asg) === 0
  );
};

describeDatabaseIntegration("operation shifts migration 127 corrections (SQL)", () => {
  let companyId = "";
  let serviceId = "";
  const cleanupOps: string[] = [];
  const cleanupEmployees: string[] = [];
  const cleanupTemplates: string[] = [];
  const cleanupShifts: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();

    // Ensure Phase 1 uniqueness + Phase 2 versioned core (idempotent).
    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_127, "utf8"));
    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_128, "utf8"));
    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_129, "utf8"));
    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_130, "utf8"));
    assertPhase1SchemaPresent(await readFingerprint());
    assert.equal(await isPhase2Versioned(), true);

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id
        FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId, "active operational_location required");
  });

  after(async () => {
    const pool = getPool();
    for (const id of cleanupShifts) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`
          DELETE FROM dbo.operation_shift_version_days
          WHERE operation_shift_version_id IN (
            SELECT id FROM dbo.operation_shift_versions WHERE operation_shift_id = @id
          );
          DELETE FROM dbo.operation_shift_versions WHERE operation_shift_id = @id;
          DELETE FROM dbo.operation_shift_date_exceptions WHERE operation_shift_id = @id;
          DELETE FROM dbo.operation_shifts WHERE id = @id;
        `);
    }
    for (const id of cleanupTemplates) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM dbo.company_shift_templates WHERE id = @id`);
    }
    for (const opId of cleanupOps) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, opId)
        .query(`
          DELETE FROM dbo.attendance_records
          WHERE employee_workday_id IN (
            SELECT ew.id FROM dbo.employee_workdays ew
            INNER JOIN dbo.operation_workdays ow ON ow.id = ew.operation_workday_id
            WHERE ow.operation_id = @id
          );
          DELETE FROM dbo.employee_workdays
          WHERE operation_workday_id IN (
            SELECT id FROM dbo.operation_workdays WHERE operation_id = @id
          );
          DELETE FROM dbo.operation_workdays WHERE operation_id = @id;
          DELETE FROM dbo.operation_assignments WHERE operation_id = @id;
          DELETE FROM dbo.operation_shift_date_exceptions WHERE operation_id = @id;
          DELETE FROM dbo.operation_shift_version_days
          WHERE operation_shift_version_id IN (
            SELECT v.id FROM dbo.operation_shift_versions v
            INNER JOIN dbo.operation_shifts s ON s.id = v.operation_shift_id
            WHERE s.operation_id = @id
          );
          DELETE FROM dbo.operation_shift_versions
          WHERE operation_shift_id IN (
            SELECT id FROM dbo.operation_shifts WHERE operation_id = @id
          );
          DELETE FROM dbo.operation_shifts WHERE operation_id = @id;
          DELETE FROM dbo.scheduled_operations WHERE id = @id;
        `);
    }
    for (const empId of cleanupEmployees) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, empId)
        .query(`DELETE FROM dbo.employees WHERE id = @id`);
    }
    await teardownDatabaseIntegration();
  });

  it("preserves historical ONE_TIME/RECURRING graph across re-apply of 127", async () => {
    const pool = getPool();
    const workDate = "2026-09-14";

    const employee = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `ShiftMig Emp ${randomUUID().slice(0, 8)}`)
      .input("phone", sql.NVarChar(30), `+54911${String(Date.now()).slice(-8)}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employee.recordset[0].id);
    cleanupEmployees.push(employeeId);

    const oneTime = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .query(`
        INSERT INTO dbo.scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes,
          early_tolerance_source, late_tolerance_source, status
        )
        OUTPUT INSERTED.id, INSERTED.schedule_mode, INSERTED.scheduled_start, INSERTED.scheduled_end
        VALUES (
          @companyId, @serviceId, N'ONE_TIME',
          '2026-09-14T12:00:00', '2026-09-14T20:00:00',
          30, 30, N'CUSTOM', N'CUSTOM', N'SCHEDULED'
        );
      `);
    const oneTimeId = String(oneTime.recordset[0].id);
    cleanupOps.push(oneTimeId);
    assert.equal(String(oneTime.recordset[0].schedule_mode), "SINGLE");

    const recurring = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .query(`
        INSERT INTO dbo.scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes,
          early_tolerance_source, late_tolerance_source, status
        )
        OUTPUT INSERTED.id, INSERTED.schedule_mode
        VALUES (
          @companyId, @serviceId, N'RECURRING',
          NULL, NULL,
          30, 30, N'CUSTOM', N'CUSTOM', N'SCHEDULED'
        );
      `);
    const recurringId = String(recurring.recordset[0].id);
    cleanupOps.push(recurringId);
    assert.equal(String(recurring.recordset[0].schedule_mode), "SINGLE");

    const workday = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, oneTimeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO dbo.operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        OUTPUT INSERTED.id, INSERTED.operation_shift_id, INSERTED.shift_code_snapshot,
               INSERTED.expected_start_at, INSERTED.expected_end_at, INSERTED.status
        VALUES (
          @companyId, @operationId, @workDate,
          '2026-09-14T12:00:00', '2026-09-14T20:00:00',
          30, 30, 1, N'ACTIVE'
        );
      `);
    const workdayId = String(workday.recordset[0].id);
    assert.equal(workday.recordset[0].operation_shift_id, null);
    assert.equal(workday.recordset[0].shift_code_snapshot, null);
    assert.equal(String(workday.recordset[0].status), "ACTIVE");

    const assignment = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, oneTimeId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO dbo.operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until
        )
        OUTPUT INSERTED.id, INSERTED.operation_shift_id
        VALUES (NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate);
      `);
    const assignmentId = String(assignment.recordset[0].id);
    assert.equal(assignment.recordset[0].operation_shift_id, null);

    const ew = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, workdayId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        INSERT INTO dbo.employee_workdays (
          company_id, operation_workday_id, employee_id, operation_assignment_id,
          expectation_status
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @operationWorkdayId, @employeeId, @assignmentId, N'EXPECTED');
      `);
    const employeeWorkdayId = String(ew.recordset[0].id);

    const attendance = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, oneTimeId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        INSERT INTO dbo.attendance_records (
          company_id, operation_id, employee_id, employee_workday_id,
          received_latitude, received_longitude, distance_meters,
          validation_status, location_status, punctuality_status, received_at
        )
        OUTPUT INSERTED.id, INSERTED.employee_workday_id, INSERTED.punctuality_status
        VALUES (
          @companyId, @operationId, @employeeId, @employeeWorkdayId,
          -34.6, -58.4, 12.5,
          N'VALID', N'INSIDE_GEOFENCE', N'ON_TIME', '2026-09-14T12:05:00'
        );
      `);
    const attendanceId = String(attendance.recordset[0].id);
    assert.equal(String(attendance.recordset[0].employee_workday_id), employeeWorkdayId);

    const before = {
      oneTimeId,
      recurringId,
      workdayId,
      assignmentId,
      employeeWorkdayId,
      attendanceId,
      workdayStart: String(workday.recordset[0].expected_start_at),
      workdayEnd: String(workday.recordset[0].expected_end_at),
      attendanceStatus: String(attendance.recordset[0].punctuality_status),
    };

    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_127, "utf8"));
    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_128, "utf8"));
    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_129, "utf8"));
    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_130, "utf8"));
    assertPhase1SchemaPresent(await readFingerprint());
    assert.equal(await isPhase2Versioned(), true);

    const after = await pool
      .request()
      .input("oneTimeId", sql.UniqueIdentifier, oneTimeId)
      .input("recurringId", sql.UniqueIdentifier, recurringId)
      .input("workdayId", sql.UniqueIdentifier, workdayId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .query(`
        SELECT
          (SELECT schedule_mode FROM dbo.scheduled_operations WHERE id = @oneTimeId) AS ot_mode,
          (SELECT schedule_mode FROM dbo.scheduled_operations WHERE id = @recurringId) AS rec_mode,
          (SELECT operation_shift_id FROM dbo.operation_workdays WHERE id = @workdayId) AS wd_shift,
          (SELECT shift_code_snapshot FROM dbo.operation_workdays WHERE id = @workdayId) AS wd_code,
          (SELECT shift_name_snapshot FROM dbo.operation_workdays WHERE id = @workdayId) AS wd_name,
          (SELECT CAST(expected_start_at AS NVARCHAR(33)) FROM dbo.operation_workdays WHERE id = @workdayId) AS wd_start,
          (SELECT CAST(expected_end_at AS NVARCHAR(33)) FROM dbo.operation_workdays WHERE id = @workdayId) AS wd_end,
          (SELECT status FROM dbo.operation_workdays WHERE id = @workdayId) AS wd_status,
          (SELECT operation_shift_id FROM dbo.operation_assignments WHERE id = @assignmentId) AS asg_shift,
          (SELECT id FROM dbo.employee_workdays WHERE id = @employeeWorkdayId) AS ew_id,
          (SELECT employee_workday_id FROM dbo.attendance_records WHERE id = @attendanceId) AS att_ew,
          (SELECT punctuality_status FROM dbo.attendance_records WHERE id = @attendanceId) AS att_status;
      `);

    const row = after.recordset[0];
    assert.equal(String(row.ot_mode), "SINGLE");
    assert.equal(String(row.rec_mode), "SINGLE");
    assert.equal(row.wd_shift, null);
    assert.equal(row.wd_code, null);
    assert.equal(row.wd_name, null);
    assert.equal(String(row.wd_status), "ACTIVE");
    assert.equal(row.asg_shift, null);
    assert.equal(String(row.ew_id), before.employeeWorkdayId);
    assert.equal(String(row.att_ew), before.employeeWorkdayId);
    assert.equal(String(row.att_status), before.attendanceStatus);
    assert.ok(String(row.wd_start).includes("2026-09-14"));
    assert.ok(String(row.wd_end).includes("2026-09-14"));

    const hybrids = await listHybridShiftScheduleStates(companyId);
    assert.equal(
      hybrids.filter((h) => h.operationId === oneTimeId || h.operationId === recurringId).length,
      0,
    );
  });

  it("rollback empty restores pre-127 schema when Phase 1 catalog is empty", async () => {
    const pool = getPool();
    if (await isPhase2Versioned()) {
      // Phase 2 present: 127 empty rollback must refuse until 129 is rolled back.
      await assert.rejects(
        () => executeSqlFileAutocommit(ROLLBACK_127),
        /Phase 2 operation_shift_versions present|operation_shifts rows exist|company_shift_templates rows exist|Rollback blocked/,
      );
      assertPhase1SchemaPresent(await readFingerprint());
      assert.equal(await isPhase2Versioned(), true);
      return;
    }
    if (!(await phase1CatalogEmpty())) {
      // Shared DB may retain templates/shifts from parallel suites; empty rollback cannot run safely.
      const counts = await pool.request().query(`
        SELECT
          (SELECT COUNT(*) FROM dbo.company_shift_templates) AS templates,
          (SELECT COUNT(*) FROM dbo.operation_shifts) AS shifts;
      `);
      assert.ok(
        Number(counts.recordset[0].templates) + Number(counts.recordset[0].shifts) > 0,
        "expected non-empty Phase 1 catalog when skipping empty rollback",
      );
      return;
    }

    const before = await readFingerprint();
    assertPhase1SchemaPresent(before);

    await executeSqlFileAutocommit(ROLLBACK_127);
    assertPrePhase1Schema(await readFingerprint());

    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_127, "utf8"));
    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_128, "utf8"));
    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_129, "utf8"));
    await applySqlScriptInTransaction(pool, readFileSync(MIGRATION_130, "utf8"));
    assertPhase1SchemaPresent(await readFingerprint());
    assert.equal(await isPhase2Versioned(), true);
  });

  it("rollback blocked cases leave Phase 1 schema intact", async () => {
    const pool = getPool();
    const baseline = await readFingerprint();
    assertPhase1SchemaPresent(baseline);

    const expectBlockedIntact = async (
      seed: () => Promise<() => Promise<void>>,
      message: RegExp = /Rollback blocked/,
    ) => {
      const cleanup = await seed();
      try {
        await assert.rejects(() => executeSqlFileAutocommit(ROLLBACK_127), message);
        assert.deepEqual(await readFingerprint(), baseline);
      } finally {
        await cleanup();
      }
    };

    // Template present (may also hit earlier guards if other suites left shifts; schema must stay intact).
    await expectBlockedIntact(async () => {
      const template = await operationShiftFoundationService.createTemplate(companyId, {
        code: `RB_TPL_${randomUUID().slice(0, 6)}`,
        name: "Rollback guard template",
        startTime: "06:00",
        endTime: "14:00",
      });
      cleanupTemplates.push(template.id);
      return async () => {
        await pool
          .request()
          .input("id", sql.UniqueIdentifier, template.id)
          .query(`DELETE FROM dbo.company_shift_templates WHERE id = @id`);
      };
    });

    const op = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .query(`
        INSERT INTO dbo.scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME',
          '2026-09-20T10:00:00', '2026-09-20T18:00:00',
          30, 30, N'SCHEDULED'
        );
      `);
    const operationId = String(op.recordset[0].id);
    cleanupOps.push(operationId);

    await expectBlockedIntact(async () => {
      const shift = await operationShiftFoundationService.createOperationShift(companyId, {
        operationId,
        code: `RB_SH_${randomUUID().slice(0, 6)}`,
        name: "Rollback guard shift",
        startTime: "06:00",
        endTime: "14:00",
        effectiveFrom: "2026-09-01",
      });
      cleanupShifts.push(shift.id);
      return async () => {
        await pool
          .request()
          .input("id", sql.UniqueIdentifier, shift.id)
          .query(`
            DELETE FROM dbo.operation_shift_version_days
            WHERE operation_shift_version_id IN (
              SELECT id FROM dbo.operation_shift_versions WHERE operation_shift_id = @id
            );
            DELETE FROM dbo.operation_shift_versions WHERE operation_shift_id = @id;
            DELETE FROM dbo.operation_shifts WHERE id = @id;
          `);
      };
    }, /operation_shifts rows exist/);

    const shiftForWd = await operationShiftFoundationService.createOperationShift(companyId, {
      operationId,
      code: `RB_WD_${randomUUID().slice(0, 6)}`,
      name: "WD shift",
      startTime: "06:00",
      endTime: "14:00",
      effectiveFrom: "2026-09-01",
    });
    cleanupShifts.push(shiftForWd.id);

    await expectBlockedIntact(async () => {
      await pool
        .request()
        .input("operationId", sql.UniqueIdentifier, operationId)
        .query(`UPDATE dbo.scheduled_operations SET schedule_mode = N'MULTI_SHIFT' WHERE id = @operationId`);
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, operationId)
        .input("shiftId", sql.UniqueIdentifier, shiftForWd.id)
        .query(`
          INSERT INTO dbo.operation_workdays (
            company_id, operation_id, work_date, operation_shift_id,
            shift_code_snapshot, shift_name_snapshot,
            expected_start_at, expected_end_at,
            early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
          ) VALUES (
            @companyId, @operationId, '2026-09-21', @shiftId,
            N'WD', N'WD',
            '2026-09-21T06:00:00', '2026-09-21T14:00:00',
            30, 30, 1, N'ACTIVE'
          );
        `);
      return async () => {
        await pool
          .request()
          .input("operationId", sql.UniqueIdentifier, operationId)
          .query(`
            DELETE FROM dbo.operation_workdays
            WHERE operation_id = @operationId AND operation_shift_id IS NOT NULL;
            UPDATE dbo.scheduled_operations SET schedule_mode = N'SINGLE' WHERE id = @operationId;
          `);
      };
    }, /operation_workdays with operation_shift_id exist/);

    await expectBlockedIntact(async () => {
      const employee = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("name", sql.NVarChar(200), `RB Asg ${randomUUID().slice(0, 6)}`)
        .input("phone", sql.NVarChar(30), `+54911${String(Date.now()).slice(-8)}`)
        .query(`
          DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
          INSERT INTO employees (company_id, name, phone_number, employee_type, active)
          OUTPUT INSERTED.id INTO @inserted (id)
          VALUES (@companyId, @name, @phone, N'fijo', 1);
          SELECT id FROM @inserted;
        `);
      const employeeId = String(employee.recordset[0].id);
      cleanupEmployees.push(employeeId);
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, operationId)
        .input("employeeId", sql.UniqueIdentifier, employeeId)
        .input("shiftId", sql.UniqueIdentifier, shiftForWd.id)
        .query(`
          INSERT INTO dbo.operation_assignments (
            id, company_id, operation_id, employee_id, valid_from, valid_until, operation_shift_id
          ) VALUES (
            NEWID(), @companyId, @operationId, @employeeId, '2026-09-22', '2026-09-22', @shiftId
          );
        `);
      return async () => {
        await pool
          .request()
          .input("operationId", sql.UniqueIdentifier, operationId)
          .query(`
            DELETE FROM dbo.operation_assignments
            WHERE operation_id = @operationId AND operation_shift_id IS NOT NULL;
          `);
      };
    }, /operation_assignments with operation_shift_id exist/);
  });

  it("concurrent duplicate code: one wins; version overlap conflicts; disjoint versions succeed", async () => {
    const pool = getPool();
    const op = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .query(`
        INSERT INTO dbo.scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME',
          '2026-10-01T10:00:00', '2026-10-01T18:00:00',
          30, 30, N'SCHEDULED'
        );
      `);
    const operationId = String(op.recordset[0].id);
    cleanupOps.push(operationId);

    const code = `CONC_${randomUUID().slice(0, 6)}`;
    const results = await Promise.allSettled([
      operationShiftFoundationService.createOperationShift(companyId, {
        operationId,
        code,
        name: "Concurrent A",
        startTime: "06:00",
        endTime: "14:00",
        effectiveFrom: "2026-10-01",
        effectiveUntil: null,
      }),
      operationShiftFoundationService.createOperationShift(companyId, {
        operationId,
        code,
        name: "Concurrent B",
        startTime: "06:00",
        endTime: "14:00",
        effectiveFrom: "2026-10-01",
        effectiveUntil: null,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(rejectedReason instanceof AppError);
    assert.equal(rejectedReason.code, "OPERATION_SHIFT_CODE_EXISTS");

    const winner = (fulfilled[0] as PromiseFulfilledResult<{ id: string }>).value;
    cleanupShifts.push(winner.id);

    const rows = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("code", sql.NVarChar(80), code)
      .query(`
        SELECT id FROM dbo.operation_shifts
        WHERE operation_id = @operationId AND code = @code AND is_active = 1
      `);
    assert.equal(rows.recordset.length, 1);
    assert.equal(String(rows.recordset[0].id), winner.id);

    // Disjoint versions on the same stable identity
    const base = await operationShiftFoundationService.createOperationShift(companyId, {
      operationId,
      code: `DISJ_${randomUUID().slice(0, 6)}`,
      name: "Disjoint base",
      startTime: "06:00",
      endTime: "14:00",
      effectiveFrom: "2026-11-01",
      effectiveUntil: "2026-11-15",
    });
    cleanupShifts.push(base.id);
    const nextVersion = await operationShiftFoundationService.addVersion(companyId, base.id, {
      effectiveFrom: "2026-11-16",
      effectiveUntil: "2026-11-30",
      startTime: "06:00",
      endTime: "14:00",
    });
    assert.ok(nextVersion.id);

    await assert.rejects(
      () =>
        operationShiftFoundationService.addVersion(companyId, base.id, {
          effectiveFrom: "2026-11-20",
          effectiveUntil: null,
          startTime: "07:00",
          endTime: "15:00",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "OPERATION_SHIFT_EFFECTIVE_OVERLAP",
    );

    // Concurrent overlapping version adds: one wins
    const versionShift = await operationShiftFoundationService.createOperationShift(companyId, {
      operationId,
      code: `VER_${randomUUID().slice(0, 6)}`,
      name: "Version race",
      startTime: "06:00",
      endTime: "14:00",
      effectiveFrom: "2027-01-01",
      effectiveUntil: "2027-01-09",
    });
    cleanupShifts.push(versionShift.id);

    const concurrentVersions = await Promise.allSettled([
      operationShiftFoundationService.addVersion(companyId, versionShift.id, {
        effectiveFrom: "2027-01-10",
        effectiveUntil: "2027-01-31",
        startTime: "06:00",
        endTime: "14:00",
      }),
      operationShiftFoundationService.addVersion(companyId, versionShift.id, {
        effectiveFrom: "2027-01-12",
        effectiveUntil: "2027-01-20",
        startTime: "07:00",
        endTime: "15:00",
      }),
    ]);
    const versionFulfilled = concurrentVersions.filter((r) => r.status === "fulfilled");
    const versionRejected = concurrentVersions.filter((r) => r.status === "rejected");
    assert.equal(versionFulfilled.length, 1, JSON.stringify(concurrentVersions.map((r) => r.status === "rejected" ? String((r as PromiseRejectedResult).reason) : "ok")));
    assert.equal(versionRejected.length, 1);
    const versionReject = (versionRejected[0] as PromiseRejectedResult).reason;
    assert.ok(versionReject instanceof AppError);
    assert.equal(versionReject.code, "OPERATION_SHIFT_EFFECTIVE_OVERLAP");

    // Concurrent non-overlapping versions
    const disjointShift = await operationShiftFoundationService.createOperationShift(companyId, {
      operationId,
      code: `NR_${randomUUID().slice(0, 6)}`,
      name: "Non-overlap base",
      startTime: "06:00",
      endTime: "14:00",
      effectiveFrom: "2027-02-01",
      effectiveUntil: "2027-02-10",
    });
    cleanupShifts.push(disjointShift.id);
    const concurrentDisjoint = await Promise.allSettled([
      operationShiftFoundationService.addVersion(companyId, disjointShift.id, {
        effectiveFrom: "2027-02-11",
        effectiveUntil: "2027-02-20",
        startTime: "06:00",
        endTime: "14:00",
      }),
      operationShiftFoundationService.addVersion(companyId, disjointShift.id, {
        effectiveFrom: "2027-02-21",
        effectiveUntil: "2027-02-28",
        startTime: "06:00",
        endTime: "14:00",
      }),
    ]);
    assert.equal(concurrentDisjoint.filter((r) => r.status === "fulfilled").length, 2);

    const differentCodes = await Promise.allSettled([
      operationShiftFoundationService.createOperationShift(companyId, {
        operationId,
        code: `PAR_${randomUUID().slice(0, 6)}`,
        name: "Parallel 1",
        startTime: "06:00",
        endTime: "14:00",
        effectiveFrom: "2026-12-01",
        effectiveUntil: "2026-12-10",
      }),
      operationShiftFoundationService.createOperationShift(companyId, {
        operationId,
        code: `PAR2_${randomUUID().slice(0, 6)}`,
        name: "Parallel 2",
        startTime: "14:00",
        endTime: "22:00",
        effectiveFrom: "2026-12-01",
        effectiveUntil: "2026-12-10",
      }),
    ]);
    assert.equal(differentCodes.filter((r) => r.status === "fulfilled").length, 2);
    for (const r of differentCodes) {
      if (r.status === "fulfilled") {
        cleanupShifts.push(r.value.id);
      }
    }
  });

  it("productive workday insert rejects shift on SINGLE and null shift on MULTI_SHIFT", async () => {
    const pool = getPool();
    const op = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .query(`
        INSERT INTO dbo.scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME',
          '2026-12-15T10:00:00', '2026-12-15T18:00:00',
          30, 30, N'SCHEDULED'
        );
      `);
    const operationId = String(op.recordset[0].id);
    cleanupOps.push(operationId);

    await assert.rejects(
      () =>
        operationWorkdayRepository.insert(companyId, {
          operationId,
          workDate: "2026-12-15",
          expectedStartAt: new Date("2026-12-15T10:00:00Z"),
          expectedEndAt: new Date("2026-12-15T18:00:00Z"),
          earlyToleranceMinutes: 30,
          lateToleranceMinutes: 30,
          scheduleVersion: 1,
          operationShiftId: randomUUID(),
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "SHIFT_NOT_ALLOWED_FOR_SINGLE_MODE",
    );

    const created = await operationWorkdayRepository.insert(companyId, {
      operationId,
      workDate: "2026-12-15",
      expectedStartAt: new Date("2026-12-15T10:00:00Z"),
      expectedEndAt: new Date("2026-12-15T18:00:00Z"),
      earlyToleranceMinutes: 30,
      lateToleranceMinutes: 30,
      scheduleVersion: 1,
    });
    assert.equal(created.operationShiftId, null);

    await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        DELETE FROM dbo.operation_workdays WHERE operation_id = @operationId;
        UPDATE dbo.scheduled_operations SET schedule_mode = N'MULTI_SHIFT' WHERE id = @operationId;
      `);

    await assert.rejects(
      () =>
        operationWorkdayRepository.insert(companyId, {
          operationId,
          workDate: "2026-12-16",
          expectedStartAt: new Date("2026-12-16T10:00:00Z"),
          expectedEndAt: new Date("2026-12-16T18:00:00Z"),
          earlyToleranceMinutes: 30,
          lateToleranceMinutes: 30,
          scheduleVersion: 1,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "SHIFT_REQUIRED_FOR_MULTI_SHIFT_MODE",
    );

    await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`UPDATE dbo.scheduled_operations SET schedule_mode = N'SINGLE' WHERE id = @operationId`);
  });
});
