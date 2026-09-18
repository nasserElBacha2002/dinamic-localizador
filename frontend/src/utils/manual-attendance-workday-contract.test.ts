import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ManualAttendanceDialogTarget } from "../components/attendance/ManualAttendanceDialog";

/**
 * Documents the create-from-team contract: selected employeeWorkdayId must be
 * propagated so the backend never silently substitutes another jornada.
 */
describe("manual attendance workday propagation contract", () => {
  it("create targets require employeeWorkdayId from the selected jornada", () => {
    const target: ManualAttendanceDialogTarget = {
      kind: "CHECK_IN",
      mode: "create",
      operationId: "22222222-2222-2222-2222-222222222222",
      employeeId: "33333333-3333-3333-3333-333333333333",
      employeeWorkdayId: "55555555-5555-5555-5555-555555555555",
      initialOccurredAt: null,
    };
    assert.ok(target.employeeWorkdayId);
    assert.equal(target.mode, "create");
  });

  it("edit targets require expectedOccurredAt for optimistic concurrency", () => {
    const target: ManualAttendanceDialogTarget = {
      kind: "CHECK_OUT",
      mode: "edit",
      operationId: "22222222-2222-2222-2222-222222222222",
      employeeId: "33333333-3333-3333-3333-333333333333",
      attendanceId: "66666666-6666-6666-6666-666666666666",
      initialOccurredAt: "2026-09-18T20:00:00.000Z",
      expectedOccurredAt: "2026-09-18T20:00:00.000Z",
    };
    assert.equal(target.expectedOccurredAt, target.initialOccurredAt);
  });
});
