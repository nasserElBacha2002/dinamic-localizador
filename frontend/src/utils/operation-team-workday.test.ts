import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperationWorkdaySummary } from "../types/operation-workday";
import {
  buildTeamWorkdaySelectOptions,
  formatTeamWorkdayLabel,
  getOperationalTodayDate,
  pickDefaultTeamWorkday,
} from "./operation-team-workday";

const workday = (
  id: string,
  workDate: string,
  scheduledEmployeesCount = 1,
): OperationWorkdaySummary => ({
  id,
  workDate,
  expectedStartAt: `${workDate}T11:00:00.000Z`,
  expectedEndAt: null,
  status: "ACTIVE",
  scheduledEmployeesCount,
});

describe("operation team workday helpers", () => {
  it("formats today using the operational timezone without UTC day shift", () => {
    const formatted = getOperationalTodayDate("America/Argentina/Buenos_Aires");
    assert.match(formatted, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("picks today's workday instead of the earliest materialized date", () => {
    const today = "2026-07-13";
    const selected = pickDefaultTeamWorkday(
      [workday("wd-06", "2026-07-06"), workday("wd-13", today, 3)],
      today,
    );

    assert.deepEqual(selected, { workdayId: "wd-13", workDate: today });
  });

  it("returns null when there is no workday for today", () => {
    const selected = pickDefaultTeamWorkday([workday("wd-06", "2026-07-06")], "2026-07-13");
    assert.equal(selected, null);
  });

  it("labels today's workday explicitly", () => {
    const label = formatTeamWorkdayLabel("2026-07-13", "2026-07-13");
    assert.match(label, /^Hoy,/);
    assert.match(label, /13\/07\/2026/);
  });

  it("builds selector options with employee counts", () => {
    const options = buildTeamWorkdaySelectOptions(
      [workday("wd-13", "2026-07-13", 3), workday("wd-06", "2026-07-06", 1)],
      "2026-07-13",
    );

    assert.equal(options[0]?.value, "wd-13");
    assert.match(options[0]?.label ?? "", /3 colaborador/);
  });
});
