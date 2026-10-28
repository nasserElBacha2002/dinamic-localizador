import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitAbsenceQuantityByYear } from "./absence-balance-year-split";

describe("splitAbsenceQuantityByYear", () => {
  it("keeps single-year ranges intact", () => {
    assert.deepEqual(
      splitAbsenceQuantityByYear({
        startDate: "2026-08-01",
        endDate: "2026-08-05",
        totalDays: 5,
      }),
      [{ year: 2026, quantity: 5 }],
    );
  });

  it("splits cross-year ranges proportionally", () => {
    const rows = splitAbsenceQuantityByYear({
      startDate: "2026-12-30",
      endDate: "2027-01-02",
      totalDays: 4,
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.year, 2026);
    assert.equal(rows[1]?.year, 2027);
    assert.equal(
      Number((rows.reduce((sum, row) => sum + row.quantity, 0)).toFixed(1)),
      4,
    );
  });
});
