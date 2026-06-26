import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateTotalAbsenceDays,
  compareAbsenceDates,
  formatAbsenceDateDisplay,
  getUtcOffsetHoursFromTimezone,
  parseAbsenceDateInput,
} from "./absence-date";

describe("parseAbsenceDateInput", () => {
  it("parses DD/MM/YYYY", () => {
    assert.deepEqual(parseAbsenceDateInput("25/06/2026"), {
      year: 2026,
      month: 6,
      day: 25,
      iso: "2026-06-25",
    });
  });

  it("parses YYYY-MM-DD", () => {
    assert.equal(parseAbsenceDateInput("2026-06-25")?.iso, "2026-06-25");
  });

  it("rejects invalid calendar dates", () => {
    assert.equal(parseAbsenceDateInput("31/02/2026"), null);
  });
});

describe("calculateTotalAbsenceDays", () => {
  it("counts single full day", () => {
    assert.equal(
      calculateTotalAbsenceDays({
        startDate: "2026-06-25",
        endDate: "2026-06-25",
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
      }),
      1,
    );
  });

  it("counts inclusive multi-day range", () => {
    assert.equal(
      calculateTotalAbsenceDays({
        startDate: "2026-06-25",
        endDate: "2026-06-27",
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
      }),
      3,
    );
  });
});

describe("formatAbsenceDateDisplay", () => {
  it("formats ISO date for summary", () => {
    assert.equal(formatAbsenceDateDisplay("2026-06-25"), "25/06/2026");
  });
});

describe("compareAbsenceDates", () => {
  it("orders dates lexicographically by ISO", () => {
    assert.equal(compareAbsenceDates("2026-06-24", "2026-06-25"), -1);
  });
});

describe("getUtcOffsetHoursFromTimezone", () => {
  it("returns -3 for Argentina operation timezone", () => {
    assert.equal(getUtcOffsetHoursFromTimezone("America/Argentina/Buenos_Aires"), -3);
  });
});
