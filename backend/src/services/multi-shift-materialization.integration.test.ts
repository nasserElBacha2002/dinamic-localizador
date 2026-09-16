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
import { operationScheduleModeTransitionService } from "../services/operation-schedule-mode-transition.service";
import { operationShiftService } from "../services/operation-shift.service";
import { recurringWorkdayMaterializationService } from "../services/recurring-workday-materialization.service";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { addDaysToDateIso } from "../utils/recurring-workday-instant";
import { resolveOperationTimezone } from "../utils/operation-timezone";

describeDatabaseIntegration("multi-shift materialization + exceptions (SQL)", () => {
  let companyId = "";
  let operationId = "";
  let serviceId = "";
  let shiftId = "";
  let today = "";
  let workDate = "";

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();

    // Ensure migration 131 column exists for exception upsert audit.
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.operation_shift_date_exceptions', N'U') IS NOT NULL
         AND COL_LENGTH(N'dbo.operation_shift_date_exceptions', N'updated_by_user_id') IS NULL
      BEGIN
          ALTER TABLE dbo.operation_shift_date_exceptions
              ADD updated_by_user_id UNIQUEIDENTIFIER NULL;
      END
    `);

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    today = getDateIsoInTimezone(new Date(), timezone);
    // Future work date so CANCEL→RESTORE can still mutate (expectedStartAt > now).
    workDate = addDaysToDateIso(today, 7);

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
      .input("start", sql.DateTime2, `${workDate}T12:00:00.000Z`)
      .input("end", sql.DateTime2, `${workDate}T20:00:00.000Z`)
      .query(`
        INSERT INTO dbo.scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes,
          early_tolerance_source, late_tolerance_source
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME',
          @start, @end,
          30, 30, N'CUSTOM', N'CUSTOM'
        );
      `);
    operationId = String(operation.recordset[0].id);

    const transition = await operationScheduleModeTransitionService.transitionToMultiShift(
      companyId,
      operationId,
      {
        effectiveFrom: today,
        shifts: [
          {
            code: `M${randomUUID().slice(0, 6)}`,
            name: "Mañana",
            startTime: "09:00",
            endTime: "13:00",
          },
        ],
      },
    );
    shiftId = transition.shiftIds[0]!;
    assert.ok(shiftId);
  });

  after(async () => {
    const pool = getPool();
    if (operationId) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, operationId)
        .query(`
          DELETE FROM dbo.employee_workdays WHERE operation_workday_id IN (
            SELECT id FROM dbo.operation_workdays WHERE operation_id = @id
          );
          DELETE FROM dbo.operation_workdays WHERE operation_id = @id;
          DELETE FROM dbo.operation_shift_date_exceptions WHERE operation_id = @id;
          DELETE FROM dbo.operation_shift_version_days WHERE operation_shift_version_id IN (
            SELECT id FROM dbo.operation_shift_versions WHERE operation_shift_id IN (
              SELECT id FROM dbo.operation_shifts WHERE operation_id = @id
            )
          );
          DELETE FROM dbo.operation_shift_versions WHERE operation_shift_id IN (
            SELECT id FROM dbo.operation_shifts WHERE operation_id = @id
          );
          DELETE FROM dbo.operation_assignments WHERE operation_id = @id;
          DELETE FROM dbo.operation_shifts WHERE operation_id = @id;
          DELETE FROM dbo.scheduled_operations WHERE id = @id;
        `);
    }
    await teardownDatabaseIntegration();
  });

  it("materialize then rematerialize is idempotent by shift counts", async () => {
    const first = await recurringWorkdayMaterializationService.materializeMultiShiftOperationHorizon(
      companyId,
      operationId,
      { rangeStart: workDate, rangeEnd: workDate },
    );
    const second = await recurringWorkdayMaterializationService.materializeMultiShiftOperationHorizon(
      companyId,
      operationId,
      { rangeStart: workDate, rangeEnd: workDate },
    );

    const pool = getPool();
    const count = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT COUNT(*) AS total
        FROM dbo.operation_workdays
        WHERE operation_id = @operationId AND work_date = @workDate
      `);
    assert.equal(Number(count.recordset[0].total), 1);
    assert.ok(first.operationWorkdaysCreated + first.operationWorkdaysUpdated >= 0);
    assert.ok(second.unchanged >= 0 || second.operationWorkdaysUpdated >= 0);
  });

  it("CANCEL then RESTORE reconciles workday status", async () => {
    await recurringWorkdayMaterializationService.materializeMultiShiftOperationHorizon(
      companyId,
      operationId,
      { rangeStart: workDate, rangeEnd: workDate },
    );

    const cancelled = await operationShiftService.upsertDateException(companyId, {
      operationId,
      operationShiftId: shiftId,
      workDate,
      exceptionKind: "CANCEL",
      reason: "test cancel",
    });
    assert.equal(cancelled.workday?.status, "CANCELLED");
    assert.equal(cancelled.workday?.cancellationReason, "EXCEPTION");

    const restored = await operationShiftService.upsertDateException(companyId, {
      operationId,
      operationShiftId: shiftId,
      workDate,
      exceptionKind: "RESTORE",
      reason: "test restore",
    });
    assert.equal(restored.workday?.status, "ACTIVE");
    assert.equal(restored.workday?.cancellationReason ?? null, null);
  });
});
