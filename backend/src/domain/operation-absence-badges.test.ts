import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveOperationAbsenceBadges } from "../domain/operation-absence-badges";
import type { AbsenceOperationalConflictDto } from "../types/absence-operational-impact";
import {
  buildAttendanceDuringAbsenceConflictKey,
  buildResolutionCommandId,
} from "../types/absence-operational-impact";

const baseConflict = (
  overrides: Partial<AbsenceOperationalConflictDto>,
): AbsenceOperationalConflictDto => ({
  id: "c1",
  absenceRequestId: "a1",
  conflictType: "ASSIGNMENT_DURING_ABSENCE",
  severity: "WARNING",
  status: "OPEN",
  operationId: "op1",
  serviceId: "svc1",
  employeeId: "emp1",
  assignmentId: "asg1",
  employeeWorkdayId: null,
  operationWorkdayId: null,
  attendanceRecordId: null,
  sourceMessageSid: null,
  replacementEmployeeId: null,
  resolutionCode: null,
  resolutionReason: null,
  resolutionCommandId: null,
  resolvedAt: null,
  rangeStartAt: null,
  rangeEndAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("operation absence badges matrix", () => {
  it("marks replacement pending and open conflict for OPEN assignment conflict", () => {
    const badges = resolveOperationAbsenceBadges({
      employeeId: "emp1",
      assignmentId: "asg1",
      expectationStatus: "JUSTIFIED",
      conflicts: [baseConflict({})],
    });
    const codes = badges.map((b) => b.code);
    assert.ok(codes.includes("REPLACEMENT_PENDING"));
    assert.ok(codes.includes("OPEN_CONFLICT"));
    assert.ok(codes.includes("ABSENT"));
  });

  it("marks replaced when ASSIGN_REPLACEMENT resolved", () => {
    const badges = resolveOperationAbsenceBadges({
      employeeId: "emp1",
      assignmentId: "asg1",
      conflicts: [
        baseConflict({
          status: "RESOLVED",
          resolutionCode: "ASSIGN_REPLACEMENT",
          replacementEmployeeId: "emp2",
        }),
      ],
    });
    const codes = badges.map((b) => b.code);
    assert.ok(codes.includes("REPLACED"));
    assert.ok(codes.includes("RESOLVED_CONFLICT"));
  });
});

describe("resolution command idempotency keys", () => {
  it("builds stable ASSIGN_REPLACEMENT command id", () => {
    const key = buildResolutionCommandId({
      conflictId: "c1",
      resolutionCode: "ASSIGN_REPLACEMENT",
      replacementEmployeeId: "emp2",
    });
    assert.equal(key, "ASSIGN_REPLACEMENT:c1:emp2");
  });

  it("prefers explicit commandId", () => {
    const key = buildResolutionCommandId({
      conflictId: "c1",
      resolutionCode: "CANCEL_ASSIGNMENT",
      commandId: "cmd-12345678",
    });
    assert.equal(key, "cmd-12345678");
  });

  it("builds message-sid attendance conflict key", () => {
    const key = buildAttendanceDuringAbsenceConflictKey({
      companyId: "co1",
      messageSid: "SM123",
    });
    assert.match(key, /SM123/);
  });
});
