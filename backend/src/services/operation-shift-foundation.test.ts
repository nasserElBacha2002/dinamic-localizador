import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { normalizeShiftCode } from "../utils/shift-code";
import {
  assertEffectiveRange,
  assertShiftTimesDistinct,
  dateRangesOverlap,
  isOvernightShift,
  normalizeShiftTime,
  ShiftTimeError,
} from "../utils/shift-time";
import {
  assertAssignmentShiftMatchesScheduleMode,
  assertWorkdayShiftMatchesScheduleMode,
} from "../utils/operation-schedule-mode-guard";
import { DEFAULT_OPERATION_SCHEDULE_MODE, isOperationScheduleMode } from "../constants/operation-schedule-mode";
import { AppError } from "../errors/app-error";

describe("operation shift foundation (unit)", () => {
  it("normalizes shift codes stably", () => {
    assert.equal(normalizeShiftCode("  mañana  "), "MANANA");
    assert.equal(normalizeShiftCode("Tarde-1"), "TARDE_1");
  });

  it("distinguishes invalid time, equals, and overnight", () => {
    assert.equal(normalizeShiftTime("06:00"), "06:00");
    assert.equal(normalizeShiftTime("6:00"), "06:00");
    assert.equal(normalizeShiftTime("22:00:00"), "22:00");
    assertShiftTimesDistinct("06:00", "14:00");
    assertShiftTimesDistinct("22:00", "06:00");
    assert.equal(isOvernightShift("22:00", "06:00"), true);
    assert.equal(isOvernightShift("06:00", "14:00"), false);

    assert.throws(
      () => assertShiftTimesDistinct("06:00", "06:00"),
      (error: unknown) =>
        error instanceof ShiftTimeError && error.code === "SHIFT_START_EQUALS_END",
    );
    assert.throws(
      () => normalizeShiftTime("25:00"),
      (error: unknown) => error instanceof ShiftTimeError && error.code === "INVALID_SHIFT_TIME",
    );
    assert.throws(
      () => normalizeShiftTime("09:99"),
      (error: unknown) => error instanceof ShiftTimeError && error.code === "INVALID_SHIFT_TIME",
    );
    assert.throws(
      () => normalizeShiftTime(""),
      (error: unknown) => error instanceof ShiftTimeError && error.code === "INVALID_SHIFT_TIME",
    );
    assert.throws(
      () => normalizeShiftTime("06:00:01"),
      (error: unknown) => error instanceof ShiftTimeError && error.code === "INVALID_SHIFT_TIME",
    );
  });

  it("validates effective ranges", () => {
    assertEffectiveRange("2026-09-01", null);
    assertEffectiveRange("2026-09-01", "2026-09-30");
    assert.throws(() => assertEffectiveRange("2026-09-30", "2026-09-01"), /EFFECTIVE_UNTIL_BEFORE_FROM/);
  });

  it("detects overlapping date ranges", () => {
    assert.equal(dateRangesOverlap("2026-01-01", null, "2026-06-01", "2026-07-01"), true);
    assert.equal(dateRangesOverlap("2026-01-01", "2026-01-31", "2026-02-01", null), false);
  });

  it("defaults schedule mode to SINGLE and guards hybrid writes", () => {
    assert.equal(DEFAULT_OPERATION_SCHEDULE_MODE, "SINGLE");
    assert.equal(isOperationScheduleMode("SINGLE"), true);
    assert.equal(isOperationScheduleMode("MULTI_SHIFT"), true);
    assert.equal(isOperationScheduleMode("OTHER"), false);

    assert.throws(
      () => assertWorkdayShiftMatchesScheduleMode("SINGLE", "shift-id"),
      (error: unknown) =>
        error instanceof AppError && error.code === "SHIFT_NOT_ALLOWED_FOR_SINGLE_MODE",
    );
    assert.throws(
      () => assertWorkdayShiftMatchesScheduleMode("MULTI_SHIFT", null),
      (error: unknown) =>
        error instanceof AppError && error.code === "SHIFT_REQUIRED_FOR_MULTI_SHIFT_MODE",
    );
    assert.doesNotThrow(() => assertWorkdayShiftMatchesScheduleMode("SINGLE", null));
    assert.doesNotThrow(() => assertAssignmentShiftMatchesScheduleMode("MULTI_SHIFT", "s1"));
  });
});

describe("migration 127 operation shifts foundation (static)", () => {
  const root = join(process.cwd(), "..");
  const migration = readFileSync(
    join(root, "database/migrations/127_operation_shifts_foundation.sql"),
    "utf8",
  );
  const rollback = readFileSync(
    join(root, "database/migrations/rollback/127_operation_shifts_foundation_rollback.sql"),
    "utf8",
  );
  const repair = readFileSync(
    join(root, "database/migrations/128_operation_shifts_uniqueness_atomic_repair.sql"),
    "utf8",
  );

  it("creates filtered unique indexes for SINGLE and MULTI workdays", () => {
    assert.match(migration, /UX_operation_workdays_single_op_date/);
    assert.match(migration, /UX_operation_workdays_multi_op_date_shift/);
    assert.match(migration, /WHERE operation_shift_id IS NULL/);
    assert.match(migration, /WHERE operation_shift_id IS NOT NULL/);
    assert.match(migration, /DROP CONSTRAINT UQ_operation_workdays_operation_work_date/);
  });

  it("swaps uniqueness atomically with TABLOCKX and final sys.indexes verify", () => {
    assert.match(migration, /SET XACT_ABORT ON/);
    assert.match(migration, /TABLOCKX/);
    assert.match(migration, /Uniqueness migration incomplete/);
    assert.match(migration, /sys\.key_constraints/);
    assert.match(migration, /sys\.indexes/);
    // No GO between table lock and both filtered unique indexes being ensured.
    const lockProbe = migration.indexOf("SELECT TOP (0) 1 AS lock_probe");
    const incompleteThrow = migration.indexOf("Uniqueness migration incomplete");
    assert.ok(lockProbe >= 0 && incompleteThrow > lockProbe);
    const atomicBody = migration.slice(lockProbe, incompleteThrow);
    assert.doesNotMatch(atomicBody, /\nGO\r?\n/i);
    assert.match(atomicBody, /UX_operation_workdays_single_op_date/);
    assert.match(atomicBody, /UX_operation_workdays_multi_op_date_shift/);
  });

  it("backfills schedule_mode SINGLE without inventing DEFAULT shifts", () => {
    assert.match(migration, /schedule_mode = N'SINGLE'/);
    assert.doesNotMatch(migration, /INSERT INTO dbo\.company_shift_templates/);
    assert.doesNotMatch(migration, /INSERT INTO dbo\.operation_shifts/);
  });

  it("rollback guards run before destructive DDL and refuse any shift catalog rows", () => {
    assert.match(rollback, /Rollback blocked: operation_workdays with operation_shift_id exist/);
    assert.match(rollback, /Rollback blocked: operation_assignments with operation_shift_id exist/);
    assert.match(rollback, /Rollback blocked: operation_shifts rows exist/);
    assert.match(rollback, /Rollback blocked: company_shift_templates rows exist/);
    assert.match(rollback, /duplicate \(operation_id, work_date\) incompatible with legacy UQ/);
    const firstDrop = rollback.indexOf("DROP CONSTRAINT FK_operation_assignments_shift_tenant");
    const lastGuard = rollback.lastIndexOf("Rollback blocked:", firstDrop);
    assert.ok(firstDrop > 0 && lastGuard > 0 && lastGuard < firstDrop);
    assert.match(rollback, /UQ_operation_workdays_operation_work_date/);
  });

  it("repair 128 mirrors atomic uniqueness verify", () => {
    assert.match(repair, /SET XACT_ABORT ON/);
    assert.match(repair, /TABLOCKX/);
    assert.match(repair, /Uniqueness repair incomplete/);
  });
});

describe("migration 129 operation shifts versioned core (static)", () => {
  const root = join(process.cwd(), "..");
  const migration = readFileSync(
    join(root, "database/migrations/129_operation_shifts_versioned_core.sql"),
    "utf8",
  );

  it("moves times/vigencia to versions and adds date exceptions", () => {
    assert.match(migration, /CREATE TABLE dbo\.operation_shift_versions/);
    assert.match(migration, /CREATE TABLE dbo\.operation_shift_version_days/);
    assert.match(migration, /CREATE TABLE dbo\.operation_shift_date_exceptions/);
    assert.match(migration, /operation_shift_version_id/);
    assert.match(migration, /DROP COLUMN start_time/);
    assert.match(migration, /UQ_operation_shifts_operation_code/);
  });
});

describe("migration 130 cancellation EXCEPTION (static)", () => {
  const root = join(process.cwd(), "..");
  const migration = readFileSync(
    join(root, "database/migrations/130_workday_cancellation_reason_exception.sql"),
    "utf8",
  );

  it("extends cancellation reason checks with EXCEPTION", () => {
    assert.match(migration, /CK_operation_workdays_cancellation_reason/);
    assert.match(migration, /N'EXCEPTION'/);
    assert.match(migration, /CK_employee_workdays_cancellation_reason/);
  });
});

describe("migration 131 shift version tenant FK (static)", () => {
  const root = join(process.cwd(), "..");
  const migration = readFileSync(
    join(root, "database/migrations/131_operation_workday_shift_version_tenant_fk.sql"),
    "utf8",
  );

  it("adds composite shift+version FK and updated_by_user_id", () => {
    assert.match(migration, /FK_operation_workdays_shift_version_shift_tenant/);
    assert.match(migration, /UQ_operation_shift_versions_company_shift_id/);
    assert.match(migration, /updated_by_user_id/);
    assert.match(migration, /operation_shift_version_id IS NOT NULL/);
  });
});
