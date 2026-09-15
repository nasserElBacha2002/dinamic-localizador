import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MULTI_SHIFT_CONSUMER_AUDIT,
} from "../utils/multi-shift-consumer-audit";
import type { MultiShiftAttendanceLogAction } from "../utils/multi-shift-attendance-observability";

const ROOT = join(process.cwd(), "src");

const OBSERVABILITY_ACTIONS: MultiShiftAttendanceLogAction[] = [
  "selection_required",
  "selection_confirmed",
  "session_invalidated",
  "state_conflict",
  "reminder_claimed",
  "reminder_sent",
  "reminder_skipped",
  "retry_recovered",
];

describe("multi-shift observability and SAFE consumer evidence", () => {
  it("every observability action has at least one producer in source", () => {
    const sources = [
      readFileSync(join(ROOT, "services/bot/check-in-attendance.flow.ts"), "utf8"),
      readFileSync(join(ROOT, "services/attendance-reminder.service.ts"), "utf8"),
    ].join("\n");

    for (const action of OBSERVABILITY_ACTIONS) {
      assert.match(
        sources,
        new RegExp(`action:\\s*"${action}"`),
        `missing producer for action ${action}`,
      );
    }
  });

  it("SAFE coverage consumer is backed by COVERAGE_SHIFT_MISMATCH guard", () => {
    const assignment = readFileSync(
      join(ROOT, "services/operation-assignment.service.ts"),
      "utf8",
    );
    assert.match(assignment, /COVERAGE_SHIFT_MISMATCH/);
    assert.match(assignment, /resolvedShiftId = replaced\.operationShiftId/);
    const coverageSafe = MULTI_SHIFT_CONSUMER_AUDIT.find((row) =>
      row.consumer.includes("coverage"),
    );
    assert.equal(coverageSafe?.disposition, "SAFE");
  });

  it("SAFE reminder consumer is backed by employee_workday claim path", () => {
    const reminder = readFileSync(join(ROOT, "services/attendance-reminder.service.ts"), "utf8");
    const repo = readFileSync(
      join(ROOT, "repositories/attendance-notification.repository.ts"),
      "utf8",
    );
    assert.match(reminder, /employeeWorkdayId: candidate\.employeeWorkdayId/);
    assert.match(repo, /employee_workday_id/);
    assert.match(repo, /notification_type/);
    assert.match(repo, /schedule_version/);
    assert.match(
      repo,
      /employee_workday_id\s*=\s*@employeeWorkdayId[\s\S]*notification_type\s*=\s*@notificationType[\s\S]*schedule_version\s*=\s*@scheduleVersion/,
    );
    const row = MULTI_SHIFT_CONSUMER_AUDIT.find((item) =>
      item.consumer.includes("attendance-reminder.service job"),
    );
    assert.equal(row?.disposition, "SAFE");
  });

  it("SAFE alert consumer uses toDateOnlyString for workDate", () => {
    const alertRepo = readFileSync(
      join(ROOT, "repositories/admin-dynamic-attendance-alert.repository.ts"),
      "utf8",
    );
    assert.match(alertRepo, /toDateOnlyString\(record\.work_date/);
    assert.doesNotMatch(alertRepo, /String\(record\.work_date\)\.slice\(0,\s*10\)/);
  });
});
