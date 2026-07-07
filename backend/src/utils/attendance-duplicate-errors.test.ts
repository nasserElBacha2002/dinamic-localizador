import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActiveAttendanceDuplicateKeyError,
  isActiveRealAttendanceDuplicateKeyError,
  isActiveSimulationAttendanceDuplicateKeyError,
} from "./attendance-duplicate-errors";

const duplicateError = (indexName: string) =>
  Object.assign(new Error(`Violation of UNIQUE KEY constraint '${indexName}'`), {
    number: 2627,
  });

describe("attendance duplicate key helpers", () => {
  it("detects real attendance duplicate index conflicts", () => {
    const error = duplicateError("UX_attendance_records_employee_workday_active_real");
    assert.equal(isActiveRealAttendanceDuplicateKeyError(error), true);
    assert.equal(isActiveAttendanceDuplicateKeyError(error), true);
    assert.equal(isActiveSimulationAttendanceDuplicateKeyError(error), false);
  });

  it("detects simulation attendance duplicate index conflicts", () => {
    const error = duplicateError("UX_attendance_records_employee_workday_active_simulation");
    assert.equal(isActiveSimulationAttendanceDuplicateKeyError(error), true);
    assert.equal(isActiveAttendanceDuplicateKeyError(error), true);
    assert.equal(isActiveRealAttendanceDuplicateKeyError(error), false);
  });

  it("does not treat unrelated duplicate key errors as attendance duplicates", () => {
    const error = duplicateError("UQ_employee_workdays_workday_employee");
    assert.equal(isActiveAttendanceDuplicateKeyError(error), false);
  });
});
