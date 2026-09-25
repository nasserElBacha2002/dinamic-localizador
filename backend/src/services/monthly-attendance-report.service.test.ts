import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MonthlyAttendanceReportRow } from "../repositories/monthly-attendance-report.repository";
import { buildMonthlyAttendanceDatasetFromRows } from "./monthly-attendance-report.service";

const evaluatedAt = new Date("2026-10-02T15:00:00.000Z");
const row = (overrides: Partial<MonthlyAttendanceReportRow> = {}): MonthlyAttendanceReportRow => ({
  employee_workday_id: "ew-1", employee_id: "employee-1", employee_name: "Ada",
  operation_workday_id: "ow-1", operation_id: "op-1", service_id: "service-1", service_name: "Sucursal A",
  work_date: "2026-09-30", operation_shift_id: null, shift_name_snapshot: null,
  expectation_status: "EXPECTED", confirmation_status: null, effective_state: "PRESENT",
  expected_start_at: "2026-09-30T12:00:00.000Z", expected_end_at: "2026-09-30T20:00:00.000Z", late_tolerance_minutes: 15,
  check_in_at: "2026-09-30T12:00:00.000Z", check_out_at: "2026-09-30T20:00:00.000Z",
  validation_status: "VALID", location_status: "INSIDE_GEOFENCE", punctuality_status: "ON_TIME", checkout_status: "CHECKOUT_VALID",
  worked_minutes: 480, overtime_minutes: 0, is_on_time_workday: 1, is_late_workday: 0, is_early_departure_workday: 0,
  ...overrides,
});

const dataset = (rows: MonthlyAttendanceReportRow[], overrides: Partial<{ year: number; month: number; timezone: string; evaluatedAt: Date }> = {}) =>
  buildMonthlyAttendanceDatasetFromRows({ companyId: "company-a", year: 2026, month: 9, timezone: "America/Argentina/Buenos_Aires", evaluatedAt, rows, ...overrides });

describe("monthlyAttendanceReportService dataset", () => {
  it("aggregates normal presence, late arrival, early checkout, worked minutes and extra minutes", () => {
    const result = dataset([
      row(),
      row({ employee_workday_id: "ew-2", punctuality_status: "LATE", is_on_time_workday: 0, is_late_workday: 1, worked_minutes: 450, overtime_minutes: 30, check_out_at: "2026-09-30T20:30:00.000Z", checkout_status: "CHECKOUT_LATE_EXTRA_TIME" }),
      row({ employee_workday_id: "ew-3", is_early_departure_workday: 1, checkout_status: "CHECKOUT_EARLY_REVIEW", worked_minutes: 420, check_out_at: "2026-09-30T19:00:00.000Z" }),
    ]);
    assert.equal(result.summary.presentWorkdays, 3); assert.equal(result.summary.lateWorkdays, 1);
    assert.equal(result.summary.earlyCheckoutWorkdays, 1); assert.equal(result.summary.workedMinutes, 1350);
    assert.equal(result.summary.extraWorkedMinutes, 30); assert.equal(result.summary.attendanceRate, 100);
    assert.equal(result.summary.totalWorkedMinutes, 1350); assert.equal(result.summary.totalExtraWorkedMinutes, 30);
    assert.ok(result.incidents.some((item) => item.type === "LATE"));
    assert.ok(result.incidents.some((item) => item.type === "EARLY_CHECKOUT"));
  });

  it("keeps unavailable and final presence as independent facts", () => {
    const result = dataset([row({ confirmation_status: "UNAVAILABLE" })]);
    assert.equal(result.summary.notifiedUnavailableWorkdays, 1);
    assert.equal(result.summary.presentWorkdays, 1);
    assert.equal(result.summary.absentWorkdays, 0);
  });

  it("derives absence, justified absence, confirmed absence and unannounced absence without forcing exclusivity", () => {
    const absent = row({ employee_workday_id: "absent", effective_state: "ABSENT", check_in_at: null, check_out_at: null, validation_status: null, location_status: null, punctuality_status: null, checkout_status: null, worked_minutes: 0, is_on_time_workday: 0 });
    const result = dataset([
      absent,
      row({ employee_workday_id: "justified", expectation_status: "JUSTIFIED", effective_state: "JUSTIFIED", check_in_at: null, check_out_at: null, validation_status: null, location_status: null, punctuality_status: null, checkout_status: null, worked_minutes: 0, is_on_time_workday: 0 }),
      { ...absent, employee_workday_id: "unavailable", confirmation_status: "UNAVAILABLE" },
      { ...absent, employee_workday_id: "confirmed", confirmation_status: "CONFIRMED" },
      { ...absent, employee_workday_id: "pending", confirmation_status: "PENDING" },
    ]);
    assert.equal(result.summary.absentWorkdays, 4); assert.equal(result.summary.justifiedWorkdays, 1);
    assert.equal(result.summary.notifiedUnavailableWorkdays, 1); assert.equal(result.summary.confirmedButAbsentWorkdays, 1);
    assert.equal(result.summary.unannouncedAbsenceWorkdays, 3);
    assert.equal(result.summary.missingCheckinWorkdays, 3);
    assert.equal(result.summary.attendanceRate, 0); assert.equal(result.summary.absenteeismRate, 100);
  });

  it("records missing checkout only after the end instant, never for an open/future workday", () => {
    const missing = row({ employee_workday_id: "missing", check_out_at: null, checkout_status: null, worked_minutes: 0 });
    const open = row({ employee_workday_id: "open", expected_end_at: "2026-10-03T20:00:00.000Z", check_out_at: null, checkout_status: null, worked_minutes: 0 });
    const result = dataset([missing, open]);
    assert.equal(result.summary.missingCheckoutWorkdays, 1);
    assert.equal(result.incidents.filter((item) => item.type === "MISSING_CHECKOUT").length, 1);
  });

  it("uses the daily start-plus-late-tolerance rule for missing check-in without flagging a future shift", () => {
    const overdueExpected = row({ employee_workday_id: "overdue-expected", effective_state: "EXPECTED", check_in_at: null, check_out_at: null, validation_status: null, location_status: null, punctuality_status: null, checkout_status: null, worked_minutes: 0, is_on_time_workday: 0 });
    const future = row({ employee_workday_id: "future", effective_state: "EXPECTED", expected_start_at: "2026-10-03T12:00:00.000Z", expected_end_at: "2026-10-03T20:00:00.000Z", check_in_at: null, check_out_at: null, validation_status: null, location_status: null, punctuality_status: null, checkout_status: null, worked_minutes: 0, is_on_time_workday: 0 });
    assert.equal(dataset([overdueExpected, future]).summary.missingCheckinWorkdays, 1);
  });

  it("exposes neutral persisted validation and geofence signals, including rejected attendance", () => {
    const result = dataset([
      row({ employee_workday_id: "review", validation_status: "PENDING_REVIEW", location_status: "OUTSIDE_GEOFENCE" }),
      row({ employee_workday_id: "rejected", effective_state: "ABSENT", check_in_at: "2026-09-30T12:00:00.000Z", check_out_at: null, validation_status: "REJECTED", location_status: "OUTSIDE_GEOFENCE", punctuality_status: "OUTSIDE_TIME_WINDOW", checkout_status: null, worked_minutes: 0, is_on_time_workday: 0 }),
    ]);
    assert.equal(result.summary.pendingReviewAttendances, 1); assert.equal(result.summary.rejectedAttendances, 1);
    assert.equal(result.summary.outsideGeofenceAttendances, 2);
    assert.ok(result.incidents.some((item) => item.type === "REJECTED_ATTENDANCE"));
  });

  it("preserves two shifts for one employee and keeps overnight work on its start work_date", () => {
    const result = dataset([
      row({ employee_workday_id: "morning", operation_workday_id: "ow-morning", operation_shift_id: "shift-am", shift_name_snapshot: "AM" }),
      row({ employee_workday_id: "night", operation_workday_id: "ow-night", operation_shift_id: "shift-night", shift_name_snapshot: "Noche", work_date: "2026-09-30", expected_start_at: "2026-10-01T00:00:00.000Z", expected_end_at: "2026-10-01T06:00:00.000Z", check_in_at: "2026-10-01T00:00:00.000Z", check_out_at: "2026-10-01T06:00:00.000Z", worked_minutes: 360 }),
    ]);
    assert.equal(result.employees[0]?.scheduledWorkdays, 2);
    assert.equal(result.summary.scheduledWorkdays, 2);
    assert.equal(result.period.endExclusive, "2026-10-01T03:00:00.000Z");
  });

  it("handles leap February, explicit timezone, zero denominators and deterministic ordering", () => {
    const result = dataset([
      row({ employee_workday_id: "b", employee_id: "b", employee_name: "Zoe", service_id: "z", service_name: "Zeta" }),
      row({ employee_workday_id: "a", employee_id: "a", employee_name: "Ana", service_id: "a", service_name: "Alfa" }),
    ], { year: 2024, month: 2, timezone: "America/Argentina/Buenos_Aires" });
    assert.equal(result.period.start, "2024-02-01T03:00:00.000Z"); assert.equal(result.period.endExclusive, "2024-03-01T03:00:00.000Z");
    assert.deepEqual(result.employees.map((item) => item.employeeName), ["Ana", "Zoe"]);
    const zero = dataset([row({ effective_state: "JUSTIFIED", expectation_status: "JUSTIFIED", check_in_at: null, check_out_at: null, validation_status: null, location_status: null, punctuality_status: null, checkout_status: null, worked_minutes: 0, is_on_time_workday: 0 })]);
    assert.equal(zero.summary.attendanceRate, 0); assert.equal(zero.summary.punctualityRate, 0);
  });
});
