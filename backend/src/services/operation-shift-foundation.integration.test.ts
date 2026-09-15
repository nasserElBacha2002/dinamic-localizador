import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companyShiftTemplateRepository } from "../repositories/company-shift-template.repository";
import { operationShiftRepository } from "../repositories/operation-shift.repository";
import { operationShiftFoundationService } from "../services/operation-shift-foundation.service";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

describeDatabaseIntegration("operation shifts foundation (SQL)", () => {
  let companyId = "";
  let otherCompanyId = "";
  let operationId = "";
  let serviceId = "";
  const templateIds: string[] = [];
  const shiftIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();

    const otherCompany = await pool
      .request()
      .input("name", sql.NVarChar(200), `Shift Audit Co ${randomUUID().slice(0, 8)}`)
      .query(`
        INSERT INTO companies (name, default_timezone, status)
        OUTPUT INSERTED.id
        VALUES (@name, N'America/Argentina/Buenos_Aires', N'ACTIVE');
      `);
    otherCompanyId = String(otherCompany.recordset[0].id);

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

    const operation = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .query(`
        INSERT INTO dbo.scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes,
          early_tolerance_source, late_tolerance_source
        )
        OUTPUT INSERTED.id, INSERTED.schedule_mode
        VALUES (
          @companyId, @serviceId, N'ONE_TIME',
          SYSUTCDATETIME(), DATEADD(hour, 8, SYSUTCDATETIME()),
          30, 30, N'CUSTOM', N'CUSTOM'
        );
      `);
    operationId = String(operation.recordset[0].id);
    assert.equal(String(operation.recordset[0].schedule_mode), "SINGLE");
  });

  after(async () => {
    const pool = getPool();
    if (operationId) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, operationId)
        .query(`
          DELETE FROM dbo.operation_workdays WHERE operation_id = @id;
          DELETE FROM dbo.operation_assignments WHERE operation_id = @id;
          DELETE FROM dbo.operation_shift_date_exceptions WHERE operation_id = @id;
        `);
    }
    for (const id of shiftIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`
          DELETE FROM dbo.operation_shift_version_days
          WHERE operation_shift_version_id IN (
            SELECT id FROM dbo.operation_shift_versions WHERE operation_shift_id = @id
          );
          DELETE FROM dbo.operation_shift_versions WHERE operation_shift_id = @id;
          DELETE FROM dbo.operation_shifts WHERE id = @id;
        `);
    }
    for (const id of templateIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM dbo.company_shift_templates WHERE id = @id`);
    }
    if (operationId) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, operationId)
        .query(`DELETE FROM dbo.scheduled_operations WHERE id = @id`);
    }
    if (otherCompanyId) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, otherCompanyId)
        .query(`DELETE FROM dbo.companies WHERE id = @id`);
    }
    await teardownDatabaseIntegration();
  });

  it("backfill: existing operations are SINGLE; fixture stays shiftless", async () => {
    const pool = getPool();
    const modes = await pool.request().query(`
      SELECT COUNT(*) AS cnt
      FROM dbo.scheduled_operations
      WHERE schedule_mode <> N'SINGLE' OR schedule_mode IS NULL;
    `);
    assert.equal(Number(modes.recordset[0].cnt), 0);

    const fixture = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT
          so.schedule_mode,
          (SELECT COUNT(*) FROM dbo.operation_workdays ow
            WHERE ow.operation_id = @operationId AND ow.operation_shift_id IS NOT NULL) AS wd_shift,
          (SELECT COUNT(*) FROM dbo.operation_assignments oa
            WHERE oa.operation_id = @operationId AND oa.operation_shift_id IS NOT NULL) AS asg_shift
        FROM dbo.scheduled_operations so
        WHERE so.id = @operationId;
      `);
    assert.equal(String(fixture.recordset[0].schedule_mode), "SINGLE");
    assert.equal(Number(fixture.recordset[0].wd_shift), 0);
    assert.equal(Number(fixture.recordset[0].asg_shift), 0);
  });

  it("rejects equal times and accepts overnight template", async () => {
    await assert.rejects(
      () =>
        operationShiftFoundationService.createTemplate(companyId, {
          code: "BAD",
          name: "Bad",
          startTime: "10:00",
          endTime: "10:00",
        }),
      (error: unknown) => error instanceof AppError && error.code === "SHIFT_START_EQUALS_END",
    );

    const overnight = await operationShiftFoundationService.createTemplate(companyId, {
      code: `NOCHE_${randomUUID().slice(0, 6)}`,
      name: "Noche",
      startTime: "22:00",
      endTime: "06:00",
    });
    templateIds.push(overnight.id);
    assert.equal(overnight.startTime, "22:00");
    assert.equal(overnight.endTime, "06:00");
  });

  it("enforces unique template code per company but allows cross-company reuse", async () => {
    const code = `MANANA_${randomUUID().slice(0, 6)}`;
    const first = await companyShiftTemplateRepository.create(companyId, {
      code,
      name: "Mañana",
      startTime: "06:00",
      endTime: "14:00",
      sortOrder: 1,
      isActive: true,
    });
    templateIds.push(first.id);

    await assert.rejects(
      () =>
        companyShiftTemplateRepository.create(companyId, {
          code,
          name: "Mañana 2",
          startTime: "06:00",
          endTime: "14:00",
          sortOrder: 2,
          isActive: true,
        }),
      (error: unknown) => isDuplicateKeyError(error),
    );

    const other = await companyShiftTemplateRepository.create(otherCompanyId, {
      code,
      name: "Mañana other",
      startTime: "06:00",
      endTime: "14:00",
      sortOrder: 1,
      isActive: true,
    });
    templateIds.push(other.id);
    assert.equal(other.code, code);
    assert.notEqual(other.companyId, companyId);
  });

  it("rejects cross-tenant template FK on operation_shifts", async () => {
    const foreign = await companyShiftTemplateRepository.create(otherCompanyId, {
      code: `FX_${randomUUID().slice(0, 6)}`,
      name: "Foreign",
      startTime: "06:00",
      endTime: "14:00",
      sortOrder: 1,
      isActive: true,
    });
    templateIds.push(foreign.id);

    await assert.rejects(
      () =>
        operationShiftRepository.createIdentity(companyId, {
          operationId,
          templateId: foreign.id,
          code: `X_${randomUUID().slice(0, 6)}`,
          name: "X",
          sortOrder: 1,
          isActive: true,
        }),
    );
  });

  it("SINGLE unique: cannot duplicate NULL-shift workday; MULTI allows two shifts same date", async () => {
    const pool = getPool();
    const workDate = "2026-09-15";

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO dbo.operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        ) VALUES (
          @companyId, @operationId, @workDate,
          '2026-09-15T09:00:00', '2026-09-15T17:00:00',
          30, 30, 1, N'ACTIVE'
        );
      `);

    await assert.rejects(
      () =>
        pool
          .request()
          .input("companyId", sql.UniqueIdentifier, companyId)
          .input("operationId", sql.UniqueIdentifier, operationId)
          .input("workDate", sql.Date, workDate)
          .query(`
            INSERT INTO dbo.operation_workdays (
              company_id, operation_id, work_date, expected_start_at, expected_end_at,
              early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
            ) VALUES (
              @companyId, @operationId, @workDate,
              '2026-09-15T10:00:00', '2026-09-15T18:00:00',
              30, 30, 1, N'ACTIVE'
            );
          `),
      (error: unknown) => isDuplicateKeyError(error),
    );

    await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        DELETE FROM dbo.operation_workdays
        WHERE operation_id = @operationId AND work_date = @workDate AND operation_shift_id IS NULL;
      `);

    const morning = await operationShiftFoundationService.createOperationShift(companyId, {
      operationId,
      code: `M_${randomUUID().slice(0, 6)}`,
      name: "Mañana",
      startTime: "06:00",
      endTime: "14:00",
      effectiveFrom: "2026-09-01",
    });
    shiftIds.push(morning.id);
    const afternoon = await operationShiftFoundationService.createOperationShift(companyId, {
      operationId,
      code: `T_${randomUUID().slice(0, 6)}`,
      name: "Tarde",
      startTime: "14:00",
      endTime: "22:00",
      effectiveFrom: "2026-09-01",
    });
    shiftIds.push(afternoon.id);

    // Index coverage for MULTI_SHIFT uniqueness — temporarily flip mode for this op only.
    await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        UPDATE dbo.scheduled_operations
        SET schedule_mode = N'MULTI_SHIFT'
        WHERE id = @operationId
      `);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .input("shiftId", sql.UniqueIdentifier, morning.id)
      .query(`
        INSERT INTO dbo.operation_workdays (
          company_id, operation_id, work_date, operation_shift_id,
          shift_code_snapshot, shift_name_snapshot,
          expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        ) VALUES (
          @companyId, @operationId, @workDate, @shiftId,
          N'MANANA', N'Mañana',
          '2026-09-15T09:00:00', '2026-09-15T17:00:00',
          30, 30, 1, N'ACTIVE'
        );
      `);

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .input("shiftId", sql.UniqueIdentifier, afternoon.id)
      .query(`
        INSERT INTO dbo.operation_workdays (
          company_id, operation_id, work_date, operation_shift_id,
          shift_code_snapshot, shift_name_snapshot,
          expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        ) VALUES (
          @companyId, @operationId, @workDate, @shiftId,
          N'TARDE', N'Tarde',
          '2026-09-15T17:00:00', '2026-09-15T01:00:00',
          30, 30, 1, N'ACTIVE'
        );
      `);

    await assert.rejects(
      () =>
        pool
          .request()
          .input("companyId", sql.UniqueIdentifier, companyId)
          .input("operationId", sql.UniqueIdentifier, operationId)
          .input("workDate", sql.Date, workDate)
          .input("shiftId", sql.UniqueIdentifier, morning.id)
          .query(`
            INSERT INTO dbo.operation_workdays (
              company_id, operation_id, work_date, operation_shift_id,
              shift_code_snapshot, shift_name_snapshot,
              expected_start_at, expected_end_at,
              early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
            ) VALUES (
              @companyId, @operationId, @workDate, @shiftId,
              N'MANANA', N'Mañana',
              '2026-09-15T09:30:00', '2026-09-15T17:30:00',
              30, 30, 1, N'ACTIVE'
            );
          `),
      (error: unknown) => isDuplicateKeyError(error),
    );

    await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        DELETE FROM dbo.operation_workdays
        WHERE operation_id = @operationId AND operation_shift_id IS NOT NULL;
        UPDATE dbo.scheduled_operations
        SET schedule_mode = N'SINGLE'
        WHERE id = @operationId;
      `);
  });

  it("rejects invalid effective range and overlapping versions on same shift", async () => {
    await assert.rejects(
      () =>
        operationShiftFoundationService.createOperationShift(companyId, {
          operationId,
          code: "OVER",
          name: "Over",
          startTime: "06:00",
          endTime: "14:00",
          effectiveFrom: "2026-09-10",
          effectiveUntil: "2026-09-01",
        }),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_SHIFT_EFFECTIVE_RANGE",
    );

    const first = await operationShiftFoundationService.createOperationShift(companyId, {
      operationId,
      code: "OVERLAP",
      name: "Overlap A",
      startTime: "06:00",
      endTime: "14:00",
      effectiveFrom: "2026-10-01",
      effectiveUntil: null,
    });
    shiftIds.push(first.id);

    await assert.rejects(
      () =>
        operationShiftFoundationService.addVersion(companyId, first.id, {
          effectiveFrom: "2026-10-15",
          effectiveUntil: null,
          startTime: "06:00",
          endTime: "14:00",
        }),
      (error: unknown) => error instanceof AppError && error.code === "OPERATION_SHIFT_EFFECTIVE_OVERLAP",
    );

    await assert.rejects(
      () =>
        operationShiftFoundationService.createOperationShift(companyId, {
          operationId,
          code: "OVERLAP",
          name: "Overlap B",
          startTime: "06:00",
          endTime: "14:00",
          effectiveFrom: "2026-10-15",
          effectiveUntil: null,
        }),
      (error: unknown) => error instanceof AppError && error.code === "OPERATION_SHIFT_CODE_EXISTS",
    );
  });
});
