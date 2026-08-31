import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("attendance-notification.repository workday reminder SQL", () => {
  const source = readFileSync(
    join(process.cwd(), "src/repositories/attendance-notification.repository.ts"),
    "utf8",
  );

  it("uses workday expected_* windows instead of coherent scheduled equality", () => {
    assert.match(source, /WORKDAY_REMINDER_JOINS/);
    assert.match(source, /ow\.expected_start_at AS scheduled_start/);
    assert.match(source, /ow\.expected_end_at AS scheduled_end/);
    assert.match(source, /ow\.expected_start_at >= @windowStart/);
    assert.match(source, /ow\.expected_end_at >= @windowStart/);
    assert.doesNotMatch(source, /ow\.expected_start_at = i\.scheduled_start/);
    assert.doesNotMatch(source, /ow\.expected_end_at = i\.scheduled_end/);
  });

  it("discovers arrival / exit / no-check-in for ONE_TIME and RECURRING", () => {
    assert.match(source, /operation_kind IN \(N'ONE_TIME', N'RECURRING'\)/);
    assert.match(source, /findArrivalReminderCandidates/);
    assert.match(source, /findExitReminderCandidates/);
    assert.match(source, /findNoCheckInAtStartCandidates/);
  });

  it("keeps confirmation reminders ONE_TIME-only with assignment confirmation_status", () => {
    const confirmationBlock = source.slice(source.indexOf("findConfirmationReminderCandidates"));
    assert.match(confirmationBlock, /operation_kind = N'ONE_TIME'/);
    assert.match(confirmationBlock, /confirmation_status = 'PENDING'/);
  });

  it("binds attendance to employee_workday_id", () => {
    assert.match(source, /ar\.employee_workday_id = ew\.id/);
    assert.doesNotMatch(
      source.slice(source.indexOf("findArrivalReminderCandidates")),
      /ar\.operation_id = i\.id\s+AND\s+ar\.employee_id = e\.id/,
    );
  });

  it("uses distinct schedule_version for RECURRING work dates", () => {
    assert.match(source, /WHEN i\.operation_kind = N'RECURRING' THEN/);
    assert.match(source, /YEAR\(ow\.work_date\) \* 10000/);
  });

  it("excludes existing check-in from arrival candidates", () => {
    const arrivalBlock = source.slice(
      source.indexOf("findArrivalReminderCandidates"),
      source.indexOf("findNoCheckInAtStartCandidates"),
    );
    assert.match(arrivalBlock, /LEFT JOIN attendance_records ar/);
    // Exit-only rows (received_at NULL) remain eligible for arrival reminders / missing check-in.
    assert.match(arrivalBlock, /AND \(ar\.id IS NULL OR ar\.received_at IS NULL\)/);
  });

  it("requires EXPECTED employee_workday and ACTIVE operation_workday", () => {
    assert.match(source, /ew\.expectation_status = 'EXPECTED'/);
    assert.match(source, /ow\.status = 'ACTIVE'/);
  });

  it("resolves manual candidates by optional workday identity and schedule_version", () => {
    const block = source.slice(source.indexOf("findReminderCandidateByIds"));
    assert.match(block, /employeeWorkdayId\?:/);
    assert.match(block, /scheduleVersion\?:/);
    assert.match(block, /AND ew\.id = @employeeWorkdayId/);
    assert.match(block, /ATTENDANCE_CONFIRMATION_REMINDER/);
    assert.match(block, /operation_kind = N'ONE_TIME'/);
  });

  it("exposes markSuperseded for terminal eligibility loss", () => {
    assert.match(source, /async markSuperseded\(/);
    assert.match(source, /SET status = 'SUPERSEDED'/);
  });
});
