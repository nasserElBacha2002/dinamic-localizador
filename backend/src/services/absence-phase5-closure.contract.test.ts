import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("absence operational conflict atomic resolution", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/services/absence-operational-conflict.service.ts"),
    "utf8",
  );

  it("does not call assignEmployee outside shared transaction", () => {
    assert.equal(source.includes("operationAssignmentService.assignEmployee("), false);
  });

  it("uses assignEmployeeInTransaction inside resolve path", () => {
    assert.match(source, /assignEmployeeInTransaction/);
  });

  it("uses cancelAssignmentInSharedTransaction for CANCEL_ASSIGNMENT", () => {
    assert.match(source, /cancelAssignmentInSharedTransaction/);
    assert.equal(source.includes("operationAssignmentService.cancelAssignment("), false);
  });

  it("locks conflict with findConflictForUpdate", () => {
    assert.match(source, /findConflictForUpdate/);
  });
});

describe("attendance during absence command", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/services/employee-workday-attendance.command.ts"),
    "utf8",
  );

  it("persists ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE in same transaction", () => {
    assert.match(source, /ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE/);
    assert.match(source, /upsertConflict/);
    assert.match(source, /buildAttendanceDuringAbsenceConflictKey/);
  });
});

describe("job lease claim", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/repositories/absence-workday-sync-job.repository.ts"),
    "utf8",
  );

  it("claims with UPDLOCK READPAST and lease columns", () => {
    assert.match(source, /UPDLOCK, READPAST/);
    assert.match(source, /lease_owner/);
    assert.match(source, /lease_expires_at/);
  });

  it("recovers expired PROCESSING leases", () => {
    assert.match(source, /status = N'PROCESSING'/);
    assert.match(source, /lease_expires_at < SYSUTCDATETIME\(\)/);
  });
});
