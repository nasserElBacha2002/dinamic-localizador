import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  manualAttendanceCreateSchema,
  manualAttendanceEditSchema,
  manualAttendancePreviewSchema,
} from "./manual-attendance.schema";

const operationId = "22222222-2222-4222-8222-222222222222";
const employeeId = "33333333-3333-4333-8333-333333333333";
const employeeWorkdayId = "55555555-5555-4555-8555-555555555555";
const attendanceId = "66666666-6666-4666-8666-666666666666";

describe("manual attendance schemas", () => {
  it("requires employeeWorkdayId on create", () => {
    const result = manualAttendanceCreateSchema.safeParse({
      kind: "CHECK_IN",
      operationId,
      employeeId,
      occurredAt: "2026-09-18T11:00:00.000Z",
      reason: "Motivo",
    });
    assert.equal(result.success, false);
  });

  it("requires expectedOccurredAt on edit", () => {
    const result = manualAttendanceEditSchema.safeParse({
      kind: "CHECK_IN",
      occurredAt: "2026-09-18T11:00:00.000Z",
      reason: "Motivo",
    });
    assert.equal(result.success, false);
  });

  it("requires employeeWorkdayId for preview create path", () => {
    const result = manualAttendancePreviewSchema.safeParse({
      kind: "CHECK_IN",
      operationId,
      employeeId,
      occurredAt: "2026-09-18T11:00:00.000Z",
    });
    assert.equal(result.success, false);
  });

  it("accepts preview with attendanceId without employeeWorkdayId", () => {
    const result = manualAttendancePreviewSchema.safeParse({
      kind: "CHECK_IN",
      operationId,
      attendanceId,
      occurredAt: "2026-09-18T11:00:00.000Z",
    });
    assert.equal(result.success, true);
  });

  it("parses valid create and edit payloads", () => {
    assert.equal(
      manualAttendanceCreateSchema.safeParse({
        kind: "CHECK_OUT",
        operationId,
        employeeId,
        employeeWorkdayId,
        occurredAt: "2026-09-18T20:00:00.000Z",
        reason: "Motivo",
        comment: null,
      }).success,
      true,
    );
    assert.equal(
      manualAttendanceEditSchema.safeParse({
        kind: "CHECK_IN",
        occurredAt: "2026-09-18T11:05:00.000Z",
        expectedOccurredAt: "2026-09-18T11:00:00.000Z",
        reason: "Corrección",
      }).success,
      true,
    );
  });
});
