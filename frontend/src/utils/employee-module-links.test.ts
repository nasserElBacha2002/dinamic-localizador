import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEmployeeAbsencesPath,
  buildEmployeeAttendancePath,
  buildEmployeeModulePath,
  buildEmployeePayrollReceiptsPath,
  buildEmployeeStatisticsPath,
} from "./employee-module-links";
import { parseTableUrlState } from "./table-url-state";
import { ATTENDANCE_TABLE_DEFAULTS, ATTENDANCE_TABLE_FIELDS } from "../pages/attendance/attendance-list-table-state";
import {
  ABSENCES_TABLE_DEFAULTS,
  ABSENCES_TABLE_FIELDS,
} from "../pages/absences/absences-list-table-state";
import {
  PAYROLL_RECEIPTS_TABLE_DEFAULTS,
  PAYROLL_RECEIPTS_TABLE_FIELDS,
} from "../pages/payroll-receipts/payroll-receipts-list-table-state";
import {
  buildStatisticsTableDefaults,
  STATISTICS_TABLE_FIELDS,
} from "../pages/statistics/statistics-table-state";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

describe("employee-module-links", () => {
  it("builds attendance URL with employeeIds (id, not name)", () => {
    const path = buildEmployeeAttendancePath(EMPLOYEE_ID);
    assert.equal(path, `/attendance?employeeIds=${EMPLOYEE_ID}`);
    assert.doesNotMatch(path, /Juan|name=/i);
  });

  it("builds absences URL with employeeIds and status=all", () => {
    const path = buildEmployeeAbsencesPath(EMPLOYEE_ID);
    assert.equal(path, `/absences?employeeIds=${EMPLOYEE_ID}&status=all`);
  });

  it("builds payroll receipts URL with employeeIds", () => {
    const path = buildEmployeePayrollReceiptsPath(EMPLOYEE_ID);
    assert.equal(path, `/payroll-receipts?employeeIds=${EMPLOYEE_ID}`);
  });

  it("builds statistics URL with employeeIds and employee tab", () => {
    const path = buildEmployeeStatisticsPath(EMPLOYEE_ID);
    assert.equal(path, `/statistics?employeeIds=${EMPLOYEE_ID}&tab=employee`);
  });

  it("omits employeeIds when id is empty", () => {
    assert.equal(buildEmployeeModulePath("attendance", "  "), "/attendance");
    assert.equal(buildEmployeeAbsencesPath(""), "/absences");
    assert.equal(buildEmployeePayrollReceiptsPath(""), "/payroll-receipts");
  });
});

describe("employee deep-link URL contracts", () => {
  it("Attendance list hydrates employeeIds from the deep-link", () => {
    const state = parseTableUrlState({
      defaults: ATTENDANCE_TABLE_DEFAULTS,
      fields: ATTENDANCE_TABLE_FIELDS,
      searchParams: new URLSearchParams(`employeeIds=${EMPLOYEE_ID}`),
    });
    assert.deepEqual(state.employeeIds, [EMPLOYEE_ID]);
  });

  it("Absences list hydrates employeeIds and status=all from the deep-link", () => {
    const state = parseTableUrlState({
      defaults: ABSENCES_TABLE_DEFAULTS,
      fields: ABSENCES_TABLE_FIELDS,
      searchParams: new URLSearchParams(`employeeIds=${EMPLOYEE_ID}&status=all`),
    });
    assert.deepEqual(state.employeeIds, [EMPLOYEE_ID]);
    assert.equal(state.status, "all");
  });

  it("Payroll receipts list hydrates employeeIds from the deep-link", () => {
    const state = parseTableUrlState({
      defaults: PAYROLL_RECEIPTS_TABLE_DEFAULTS,
      fields: PAYROLL_RECEIPTS_TABLE_FIELDS,
      searchParams: new URLSearchParams(`employeeIds=${EMPLOYEE_ID}`),
    });
    assert.deepEqual(state.employeeIds, [EMPLOYEE_ID]);
  });

  it("Statistics hydrates employeeIds and tab=employee from the deep-link", () => {
    const defaults = buildStatisticsTableDefaults({
      datePreset: "last_30_days",
      dateFrom: "2026-06-21",
      dateTo: "2026-07-21",
    });
    const state = parseTableUrlState({
      defaults,
      fields: STATISTICS_TABLE_FIELDS,
      searchParams: new URLSearchParams(`employeeIds=${EMPLOYEE_ID}&tab=employee`),
    });
    assert.deepEqual(state.employeeIds, [EMPLOYEE_ID]);
    assert.equal(state.tab, "employee");
  });
});
