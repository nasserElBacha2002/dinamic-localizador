import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAbsenceCalculationInputHash } from "./absence-calculation-hash";

describe("buildAbsenceCalculationInputHash", () => {
  const base = {
    absenceTypeId: "11111111-1111-4111-8111-111111111111",
    startDate: "2026-08-03",
    endDate: "2026-08-05",
    startPeriod: "FULL_DAY" as const,
    endPeriod: "FULL_DAY" as const,
    countingMode: "BUSINESS_DAYS" as const,
    calendarId: "22222222-2222-4222-8222-222222222222",
    calendarVersion: 1,
    timezone: "America/Argentina/Buenos_Aires",
  };

  it("is stable for identical inputs", () => {
    assert.equal(
      buildAbsenceCalculationInputHash(base),
      buildAbsenceCalculationInputHash(base),
    );
  });

  it("changes when calendar version changes", () => {
    const a = buildAbsenceCalculationInputHash(base);
    const b = buildAbsenceCalculationInputHash({ ...base, calendarVersion: 2 });
    assert.notEqual(a, b);
  });

  it("changes when counting mode changes", () => {
    const a = buildAbsenceCalculationInputHash(base);
    const b = buildAbsenceCalculationInputHash({
      ...base,
      countingMode: "CALENDAR_DAYS",
    });
    assert.notEqual(a, b);
  });
});
