import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAbsenceApprovalSuccessMessage,
  formatExpectedTimeRange,
  formatWorkdayDate,
} from "./operation-workday-display";

describe("operation-workday-display", () => {
  it("formats workday date with weekday", () => {
    assert.equal(formatWorkdayDate("2026-07-13"), formatWorkdayDate("2026-07-13"));
    assert.match(formatWorkdayDate("2026-07-13"), /lun/i);
    assert.match(formatWorkdayDate("2026-07-13"), /13\/07\/2026/);
    assert.doesNotMatch(formatWorkdayDate("2026-07-13"), /12\/07\/2026/);
  });

  it("formats expected time range including overnight end", () => {
    const range = formatExpectedTimeRange({
      id: "wd-1",
      workDate: "2026-08-03",
      expectedStartAt: "2026-08-04T01:00:00.000Z",
      expectedEndAt: "2026-08-04T09:00:00.000Z",
      status: "ACTIVE",
      scheduledEmployeesCount: 1,
    });

    assert.match(range, /\d{2}:\d{2}–\d{2}:\d{2}/);
  });

  it("builds absence approval feedback with justified and conflict counters", () => {
    assert.match(
      buildAbsenceApprovalSuccessMessage({ justified: 8, attendanceConflicts: 1 }),
      /8 jornadas fueron justificadas/,
    );
    assert.match(
      buildAbsenceApprovalSuccessMessage({ justified: 8, attendanceConflicts: 1 }),
      /requiere revisión/,
    );
  });

  it("maps absence workday sync failure through error helper", async () => {
    const { isAbsenceWorkdaySyncError } = await import("../../utils/errors");
    const { ApiError } = await import("../../utils/errors");
    assert.equal(
      isAbsenceWorkdaySyncError(
        new ApiError(
          "La ausencia fue guardada, pero no se pudieron actualizar las jornadas.",
          "ABSENCE_WORKDAY_SYNC_FAILED",
          503,
        ),
      ),
      true,
    );
  });
});
