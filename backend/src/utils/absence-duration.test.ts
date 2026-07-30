import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateAbsenceDuration } from "./absence-duration";
import type { CalendarWeekdayRule } from "./absence-duration";

const monFri: CalendarWeekdayRule[] = [
  { dayOfWeek: 1, isWorkingDay: true },
  { dayOfWeek: 2, isWorkingDay: true },
  { dayOfWeek: 3, isWorkingDay: true },
  { dayOfWeek: 4, isWorkingDay: true },
  { dayOfWeek: 5, isWorkingDay: true },
  { dayOfWeek: 6, isWorkingDay: false },
  { dayOfWeek: 7, isWorkingDay: false },
];

const base = {
  timezone: "America/Argentina/Buenos_Aires",
  calendarId: "cal-1",
  calendarVersion: 1,
  calculationVersion: 2,
  weekdays: monFri,
  exceptions: [] as [],
};

describe("calculateAbsenceDuration", () => {
  it("counts a single working calendar day as 1", () => {
    const result = calculateAbsenceDuration({
      ...base,
      startDate: "2026-08-03",
      endDate: "2026-08-03",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      countingMode: "CALENDAR_DAYS",
    });
    assert.equal(result.totalDays, 1);
    assert.equal(result.calendarDays, 1);
  });

  it("returns 0 counted days for a weekend in BUSINESS_DAYS", () => {
    const result = calculateAbsenceDuration({
      ...base,
      startDate: "2026-08-08",
      endDate: "2026-08-09",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      countingMode: "BUSINESS_DAYS",
    });
    assert.equal(result.totalDays, 0);
    assert.equal(result.nonWorkingDays, 2);
  });

  it("excludes weekend inside Mon–Fri BUSINESS_DAYS range", () => {
    // Mon 3 Aug 2026 – Fri 7 Aug = 5 business days
    const result = calculateAbsenceDuration({
      ...base,
      startDate: "2026-08-03",
      endDate: "2026-08-07",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      countingMode: "BUSINESS_DAYS",
    });
    assert.equal(result.totalDays, 5);
  });

  it("excludes weekend when range spans weekend", () => {
    // Mon 3 – Mon 10 Aug = 6 business days (excludes Sat/Sun)
    const result = calculateAbsenceDuration({
      ...base,
      startDate: "2026-08-03",
      endDate: "2026-08-10",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      countingMode: "BUSINESS_DAYS",
    });
    assert.equal(result.totalDays, 6);
    assert.equal(result.nonWorkingDays, 2);
  });

  it("excludes holidays in BUSINESS_DAYS", () => {
    const result = calculateAbsenceDuration({
      ...base,
      startDate: "2026-08-03",
      endDate: "2026-08-07",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      countingMode: "BUSINESS_DAYS",
      exceptions: [
        {
          date: "2026-08-05",
          name: "Feriado",
          dateType: "HOLIDAY",
          isWorkingDay: false,
        },
      ],
    });
    assert.equal(result.totalDays, 4);
    assert.equal(result.holidayDays, 1);
  });

  it("counts holiday marked as working override", () => {
    const result = calculateAbsenceDuration({
      ...base,
      startDate: "2026-08-08",
      endDate: "2026-08-08",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      countingMode: "BUSINESS_DAYS",
      exceptions: [
        {
          date: "2026-08-08",
          name: "Sábado laborable",
          dateType: "WORKING_DAY_OVERRIDE",
          isWorkingDay: true,
        },
      ],
    });
    assert.equal(result.totalDays, 1);
  });

  it("applies AM half day on single day", () => {
    const result = calculateAbsenceDuration({
      ...base,
      startDate: "2026-08-03",
      endDate: "2026-08-03",
      startPeriod: "AM",
      endPeriod: "AM",
      countingMode: "CALENDAR_DAYS",
    });
    assert.equal(result.totalDays, 0.5);
  });

  it("applies PM start and AM end across multi-day BUSINESS_DAYS", () => {
    // Tue PM + Wed full + Thu AM = 0.5+1+0.5 = 2
    const result = calculateAbsenceDuration({
      ...base,
      startDate: "2026-08-04",
      endDate: "2026-08-06",
      startPeriod: "PM",
      endPeriod: "AM",
      countingMode: "BUSINESS_DAYS",
    });
    assert.equal(result.totalDays, 2);
  });

  it("supports year boundary ranges", () => {
    const result = calculateAbsenceDuration({
      ...base,
      startDate: "2026-12-28",
      endDate: "2027-01-05",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      countingMode: "BUSINESS_DAYS",
      exceptions: [
        {
          date: "2027-01-01",
          name: "Año Nuevo",
          dateType: "HOLIDAY",
          isWorkingDay: false,
        },
      ],
    });
    // 28-29 Dec Mon-Tue, 30-31 Wed-Thu, 1 Fri holiday, 2-3 Sat-Sun, 4-5 Mon-Tue
    // business: 28,29,30,31,4,5 = 6
    assert.equal(result.totalDays, 6);
    assert.equal(result.holidayDays, 1);
  });

  it("matches legacy calendar counting for inclusive multi-day with half days", () => {
    const result = calculateAbsenceDuration({
      ...base,
      startDate: "2026-08-03",
      endDate: "2026-08-06",
      startPeriod: "PM",
      endPeriod: "AM",
      countingMode: "CALENDAR_DAYS",
    });
    // 4 calendar days - 0.5 - 0.5 = 3
    assert.equal(result.totalDays, 3);
  });

  it("rejects excessively long ranges", () => {
    assert.throws(
      () =>
        calculateAbsenceDuration({
          ...base,
          startDate: "2025-01-01",
          endDate: "2026-12-31",
          startPeriod: "FULL_DAY",
          endPeriod: "FULL_DAY",
          countingMode: "CALENDAR_DAYS",
        }),
      /ABSENCE_RANGE_TOO_LONG/,
    );
  });
});
