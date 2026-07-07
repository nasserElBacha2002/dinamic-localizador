import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatExpectedTimeRange,
  formatWorkdayDate,
  workdayStatusLabels,
} from "./operation-workday-display";

describe("operation-workday-display", () => {
  it("maps workday status labels in Spanish", () => {
    assert.equal(workdayStatusLabels.ACTIVE, "Programada");
    assert.equal(workdayStatusLabels.CANCELLED, "Cancelada");
  });

  it("formats workday date with weekday", () => {
    assert.match(formatWorkdayDate("2026-08-10"), /2026/);
    assert.match(formatWorkdayDate("2026-08-10"), /lun|mar|mié|jue|vie|sáb|dom/i);
  });

  it("formats expected time range including overnight end", () => {
    const range = formatExpectedTimeRange({
      id: "wd-1",
      workDate: "2026-08-03",
      expectedStartAt: "2026-08-04T01:00:00.000Z",
      expectedEndAt: "2026-08-04T09:00:00.000Z",
      status: "ACTIVE",
      expectedEmployeesCount: 1,
    });

    assert.match(range, /\d{2}:\d{2}–\d{2}:\d{2}/);
  });
});
