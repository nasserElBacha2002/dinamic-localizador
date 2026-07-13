import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDateOnly,
  formatDateOnlyWithWeekday,
  isDateOnlyString,
} from "./date-only";

const CASES = [
  { value: "2026-01-01", display: "01/01/2026", weekday: /jue/i },
  { value: "2026-02-28", display: "28/02/2026", weekday: /sáb|sab/i },
  { value: "2026-03-01", display: "01/03/2026", weekday: /dom/i },
  { value: "2026-07-13", display: "13/07/2026", weekday: /lun/i },
  { value: "2026-12-31", display: "31/12/2026", weekday: /jue/i },
  { value: "2028-02-29", display: "29/02/2028", weekday: /mar/i },
] as const;

describe("date-only helpers", () => {
  it("detects YYYY-MM-DD strings", () => {
    assert.equal(isDateOnlyString("2026-07-13"), true);
    assert.equal(isDateOnlyString("2026-07-13T03:00:00.000Z"), false);
    assert.equal(isDateOnlyString("13/07/2026"), false);
  });

  for (const testCase of CASES) {
    it(`formats ${testCase.value} as ${testCase.display}`, () => {
      assert.equal(formatDateOnly(testCase.value), testCase.display);
    });

    it(`formats ${testCase.value} with weekday without shifting the day`, () => {
      const formatted = formatDateOnlyWithWeekday(testCase.value);
      assert.match(formatted, testCase.weekday);
      assert.match(formatted, new RegExp(testCase.display.replace(/\//g, "\\/")));
      assert.doesNotMatch(formatted, /12\/07\/2026/);
    });
  }

  it("keeps 2026-07-13 stable regardless of process timezone", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      assert.equal(formatDateOnly("2026-07-13"), "13/07/2026");
      assert.match(formatDateOnlyWithWeekday("2026-07-13"), /lun/i);
    } finally {
      if (previousTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTimezone;
      }
    }

    process.env.TZ = "America/Argentina/Buenos_Aires";
    try {
      assert.equal(formatDateOnly("2026-07-13"), "13/07/2026");
      assert.match(formatDateOnlyWithWeekday("2026-07-13"), /lun/i);
    } finally {
      if (previousTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTimezone;
      }
    }
  });
});
