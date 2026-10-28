import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActiveAttendanceDuplicateKeyError,
  isActiveRealAttendanceDuplicateKeyError,
  isActiveSimulationAttendanceDuplicateKeyError,
  isAttendanceCheckoutMessageSidDuplicateKeyError,
  isAttendanceSourceMessageSidDuplicateKeyError,
  isLegacyInventoryActiveAttendanceDuplicateKeyError,
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
    assert.equal(isLegacyInventoryActiveAttendanceDuplicateKeyError(error), false);
  });

  it("detects simulation attendance duplicate index conflicts", () => {
    const error = duplicateError("UX_attendance_records_employee_workday_active_simulation");
    assert.equal(isActiveSimulationAttendanceDuplicateKeyError(error), true);
    assert.equal(isActiveAttendanceDuplicateKeyError(error), true);
    assert.equal(isActiveRealAttendanceDuplicateKeyError(error), false);
    assert.equal(isLegacyInventoryActiveAttendanceDuplicateKeyError(error), false);
  });

  it("detects legacy inventory active index exactly", () => {
    const error = duplicateError("UX_attendance_records_inventory_employee_active");
    assert.equal(isLegacyInventoryActiveAttendanceDuplicateKeyError(error), true);
    assert.equal(isActiveAttendanceDuplicateKeyError(error), false);
  });

  it("detects legacy bare employee_workday_active index exactly (not _real/_simulation)", () => {
    const legacy = duplicateError("UX_attendance_records_employee_workday_active");
    assert.equal(isLegacyInventoryActiveAttendanceDuplicateKeyError(legacy), true);
    assert.equal(isActiveAttendanceDuplicateKeyError(legacy), false);
  });

  it("does not treat unrelated duplicate key errors as attendance duplicates", () => {
    const error = duplicateError("UQ_employee_workdays_workday_employee");
    assert.equal(isActiveAttendanceDuplicateKeyError(error), false);
    assert.equal(isLegacyInventoryActiveAttendanceDuplicateKeyError(error), false);
  });

  it("detects source and checkout MessageSid unique constraints", () => {
    assert.equal(
      isAttendanceSourceMessageSidDuplicateKeyError(
        duplicateError("UQ_attendance_records_source_message_sid"),
      ),
      true,
    );
    assert.equal(
      isAttendanceCheckoutMessageSidDuplicateKeyError(
        duplicateError("UQ_attendance_records_checkout_message_sid"),
      ),
      true,
    );
    assert.equal(
      isAttendanceSourceMessageSidDuplicateKeyError(
        new Error("UQ_attendance_records_source_message_sid"),
      ),
      false,
    );
  });
});
