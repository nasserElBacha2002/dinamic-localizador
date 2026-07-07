import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AbsenceDayPeriod } from "../types/absence";
import { isWorkDateCoveredByAbsence } from "../utils/absence-workday-coverage";

const absence = (input: {
  startDate: string;
  endDate: string;
  startPeriod?: AbsenceDayPeriod;
  endPeriod?: AbsenceDayPeriod;
}) => ({
  startDate: input.startDate,
  endDate: input.endDate,
  startPeriod: input.startPeriod ?? "FULL_DAY",
  endPeriod: input.endPeriod ?? "FULL_DAY",
});

describe("isWorkDateCoveredByAbsence", () => {
  it("covers inclusive start and end dates", () => {
    const model = absence({ startDate: "2026-08-01", endDate: "2026-08-10" });
    assert.equal(isWorkDateCoveredByAbsence("2026-08-01", model), true);
    assert.equal(isWorkDateCoveredByAbsence("2026-08-10", model), true);
    assert.equal(isWorkDateCoveredByAbsence("2026-08-05", model), true);
  });

  it("excludes dates outside the range", () => {
    const model = absence({ startDate: "2026-08-01", endDate: "2026-08-10" });
    assert.equal(isWorkDateCoveredByAbsence("2026-07-31", model), false);
    assert.equal(isWorkDateCoveredByAbsence("2026-08-11", model), false);
  });

  it("uses operational work date for overnight shifts", () => {
    const model = absence({ startDate: "2026-08-03", endDate: "2026-08-03" });
    assert.equal(isWorkDateCoveredByAbsence("2026-08-03", model), true);
    assert.equal(isWorkDateCoveredByAbsence("2026-08-04", model), false);
  });

  it("excludes start date when absence starts in PM", () => {
    const model = absence({
      startDate: "2026-08-03",
      endDate: "2026-08-05",
      startPeriod: "PM",
    });
    assert.equal(isWorkDateCoveredByAbsence("2026-08-03", model), false);
    assert.equal(isWorkDateCoveredByAbsence("2026-08-04", model), true);
  });

  it("excludes end date when absence ends in AM", () => {
    const model = absence({
      startDate: "2026-08-03",
      endDate: "2026-08-05",
      endPeriod: "AM",
    });
    assert.equal(isWorkDateCoveredByAbsence("2026-08-05", model), false);
    assert.equal(isWorkDateCoveredByAbsence("2026-08-04", model), true);
  });
});
