import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateTotalAbsenceDays,
  compareAbsenceDates,
  formatAbsenceDateDisplay,
  getDateIsoInTimezone,
  getOperationDayUtcBounds,
  getUtcOffsetHoursFromTimezone,
  parseAbsenceDateInput,
  parseSpanishDateInput,
} from "./absence-date";

describe("parseSpanishDateInput", () => {
  it("parses DD/MM/YYYY as day-first", () => {
    assert.deepEqual(parseSpanishDateInput("05/07/2026"), {
      year: 2026,
      month: 7,
      day: 5,
      iso: "2026-07-05",
    });
  });

  it("parses single-digit day and month", () => {
    assert.deepEqual(parseSpanishDateInput("5/7/2026"), {
      year: 2026,
      month: 7,
      day: 5,
      iso: "2026-07-05",
    });
  });

  it("parses end of year", () => {
    assert.deepEqual(parseSpanishDateInput("31/12/2026"), {
      year: 2026,
      month: 12,
      day: 31,
      iso: "2026-12-31",
    });
  });

  it("rejects MM/DD/YYYY style invalid month", () => {
    assert.equal(parseSpanishDateInput("12/31/2026"), null);
  });

  it("rejects invalid calendar dates", () => {
    assert.equal(parseSpanishDateInput("31/02/2026"), null);
    assert.equal(parseSpanishDateInput("00/01/2026"), null);
    assert.equal(parseSpanishDateInput("01/00/2026"), null);
  });

  it("rejects ISO format for Spanish user input", () => {
    assert.equal(parseSpanishDateInput("2026-07-05"), null);
  });
});

describe("parseAbsenceDateInput", () => {
  it("parses DD/MM/YYYY", () => {
    assert.deepEqual(parseAbsenceDateInput("25/06/2026"), {
      year: 2026,
      month: 6,
      day: 25,
      iso: "2026-06-25",
    });
  });

  it("parses YYYY-MM-DD for API input", () => {
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

describe("getOperationDayUtcBounds", () => {
  it("returns half-open UTC bounds for a calendar day in Argentina", () => {
    const at = new Date("2026-07-03T12:00:00.000Z");
    const timezone = "America/Argentina/Buenos_Aires";

    assert.equal(getDateIsoInTimezone(at, timezone), "2026-07-03");

    const { dayStartUtc, nextDayStartUtc, dayEndUtc } = getOperationDayUtcBounds(at, timezone);

    assert.equal(dayStartUtc.toISOString(), "2026-07-03T03:00:00.000Z");
    assert.equal(nextDayStartUtc.toISOString(), "2026-07-04T03:00:00.000Z");
    assert.equal(dayEndUtc.toISOString(), "2026-07-04T02:59:59.999Z");
    assert.equal(dayEndUtc.getTime(), nextDayStartUtc.getTime() - 1);
  });
});
