import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateAttendanceRate,
  deriveWorkdayStateCounts,
} from "./attendance-statistics-metrics";
import { deriveEmployeeWorkdayState } from "./derive-employee-workday-state";
import { normalizeStatisticsFilters } from "./statistics-display-labels";
import { selectCanonicalProductionAttendance } from "./statistics-canonical-attendance";
import {
  aggregateCompanyAttendanceRate,
  aggregateProjectionSummary,
  buildAnalyticalProjectionRow,
} from "./statistics-projection-contract";

const scheduleForDate = (workDate: string) => ({
  expectedStartAt: `${workDate}T12:00:00.000Z`,
  expectedEndAt: `${workDate}T21:00:00.000Z`,
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 20,
});

describe("statistics grain contract", () => {
  it("aggregates mixed effective states into summary metrics", () => {
    const referenceAt = new Date("2026-08-10T20:00:00.000Z");
    const rows = [
      buildAnalyticalProjectionRow(
        {
          employeeWorkdayId: "a",
          expectationStatus: "EXPECTED",
          workDate: "2026-08-10",
          attendanceRecords: [
            {
              id: "ar-a",
              validationStatus: "VALID",
              receivedAt: new Date("2026-08-10T12:05:00.000Z"),
              checkoutAt: new Date("2026-08-10T21:00:00.000Z"),
              punctualityStatus: "ON_TIME",
              isSimulation: false,
            },
          ],
          ...scheduleForDate("2026-08-10"),
        },
        referenceAt,
      ),
      buildAnalyticalProjectionRow(
        {
          employeeWorkdayId: "b",
          expectationStatus: "EXPECTED",
          workDate: "2026-08-11",
          ...scheduleForDate("2026-08-11"),
        },
        new Date("2026-08-12T10:00:00.000Z"),
      ),
      buildAnalyticalProjectionRow(
        {
          employeeWorkdayId: "c",
          expectationStatus: "JUSTIFIED",
          workDate: "2026-08-12",
          ...scheduleForDate("2026-08-12"),
        },
        referenceAt,
      ),
      buildAnalyticalProjectionRow(
        {
          employeeWorkdayId: "d",
          expectationStatus: "EXPECTED",
          workDate: "2026-08-13",
          ...scheduleForDate("2026-08-13"),
        },
        referenceAt,
      ),
      buildAnalyticalProjectionRow(
        {
          employeeWorkdayId: "e",
          expectationStatus: "CANCELLED",
          workDate: "2026-08-14",
          ...scheduleForDate("2026-08-14"),
        },
        referenceAt,
      ),
    ];

    const summary = aggregateProjectionSummary(rows);
    assert.equal(summary.scheduledWorkdays, 4);
    assert.equal(summary.attendanceRequiredWorkdays, 3);
    assert.equal(summary.presentWorkdays, 1);
    assert.equal(summary.absentWorkdays, 1);
    assert.equal(summary.justifiedWorkdays, 1);
    assert.equal(summary.expectedOpenWorkdays, 1);
    assert.equal(summary.cancelledWorkdays, 1);
    assert.equal(summary.attendanceRate, 50);
    assert.equal(summary.absenceRate, 50);
  });

  it("keeps one analytical row when duplicate production attendance exists", () => {
    const referenceAt = new Date("2026-08-10T20:00:00.000Z");
    const canonical = selectCanonicalProductionAttendance([
      {
        id: "older",
        validationStatus: "REJECTED",
        receivedAt: new Date("2026-08-10T12:00:00.000Z"),
        isSimulation: false,
      },
      {
        id: "winner",
        validationStatus: "VALID",
        receivedAt: new Date("2026-08-10T12:10:00.000Z"),
        isSimulation: false,
      },
    ]);
    assert.equal(canonical?.id, "winner");

    const row = buildAnalyticalProjectionRow(
      {
        employeeWorkdayId: "ew-1",
        expectationStatus: "EXPECTED",
        workDate: "2026-08-10",
        attendanceRecords: [
          {
            id: "older",
            validationStatus: "REJECTED",
            receivedAt: new Date("2026-08-10T12:00:00.000Z"),
            checkoutAt: new Date("2026-08-10T21:00:00.000Z"),
            extraWorkedMinutes: 30,
            isSimulation: false,
          },
          {
            id: "winner",
            validationStatus: "VALID",
            receivedAt: new Date("2026-08-10T12:10:00.000Z"),
            checkoutAt: new Date("2026-08-10T21:00:00.000Z"),
            extraWorkedMinutes: 60,
            isSimulation: false,
          },
        ],
        ...scheduleForDate("2026-08-10"),
      },
      referenceAt,
    );

    assert.equal(row.effectiveState, "PRESENT");
    assert.equal(row.workedMinutes, 530);
    assert.equal(row.overtimeMinutes, 60);

    const summary = aggregateProjectionSummary([row]);
    assert.equal(summary.scheduledWorkdays, 1);
    assert.equal(summary.presentWorkdays, 1);
    assert.equal(summary.workedMinutes, 530);
    assert.equal(summary.overtimeMinutes, 60);
  });

  it("excludes simulation attendance before canonical selection", () => {
    const canonical = selectCanonicalProductionAttendance([
      {
        id: "sim",
        validationStatus: "VALID",
        receivedAt: new Date("2026-08-10T12:00:00.000Z"),
        isSimulation: true,
      },
      {
        id: "real",
        validationStatus: "PENDING_REVIEW",
        receivedAt: new Date("2026-08-10T12:05:00.000Z"),
        isSimulation: false,
      },
    ]);
    assert.equal(canonical?.id, "real");
  });

  it("aggregates recurring 5x2 opportunities with expected rates", () => {
    const referenceAt = new Date("2026-08-18T23:00:00.000Z");
    const states: Array<"PRESENT" | "ABSENT" | "JUSTIFIED" | "EXPECTED"> = [
      "PRESENT",
      "PRESENT",
      "PRESENT",
      "PRESENT",
      "PRESENT",
      "PRESENT",
      "PRESENT",
      "ABSENT",
      "JUSTIFIED",
      "EXPECTED",
    ];

    const rows = states.flatMap((state, index) => {
      const workDate = `2026-08-${String(11 + (index % 5)).padStart(2, "0")}`;
      const input = {
        employeeWorkdayId: `ew-${index}`,
        expectationStatus:
          state === "JUSTIFIED" ? ("JUSTIFIED" as const) : ("EXPECTED" as const),
        workDate,
        operationKind: "RECURRING" as const,
        ...scheduleForDate(workDate),
      };

      if (state === "PRESENT") {
        return [
          buildAnalyticalProjectionRow(
            {
              ...input,
              attendanceRecords: [
                {
                  id: `ar-${index}`,
                  validationStatus: "VALID",
                  receivedAt: new Date(`${workDate}T12:00:00.000Z`),
                  punctualityStatus: "ON_TIME",
                  isSimulation: false,
                },
              ],
            },
            referenceAt,
          ),
        ];
      }

      if (state === "ABSENT") {
        return [buildAnalyticalProjectionRow(input, new Date("2026-08-20T10:00:00.000Z"))];
      }

      const openReference = new Date(`${workDate}T20:00:00.000Z`);
      return [buildAnalyticalProjectionRow(input, openReference)];
    });

    assert.equal(rows.length, 10);
    const summary = aggregateProjectionSummary(rows);
    assert.equal(summary.scheduledWorkdays, 10);
    assert.equal(summary.attendanceRequiredWorkdays, 9);
    assert.equal(summary.presentWorkdays, 7);
    assert.equal(summary.absentWorkdays, 1);
    assert.equal(summary.justifiedWorkdays, 1);
    assert.equal(summary.expectedOpenWorkdays, 1);
    assert.equal(summary.attendanceRate, 87.5);
    assert.equal(summary.absenceRate, 12.5);
  });

  it("uses weighted company attendance rate instead of averaging employee rates", () => {
    const referenceAt = new Date("2026-08-20T10:00:00.000Z");
    const employeeARows = Array.from({ length: 10 }, (_, index) => {
      const workDate = `2026-08-${String(index + 1).padStart(2, "0")}`;
      return buildAnalyticalProjectionRow(
        {
          employeeWorkdayId: `a-${index}`,
          expectationStatus: "EXPECTED",
          workDate,
          attendanceRecords: [
            {
              id: `a-ar-${index}`,
              validationStatus: "VALID",
              receivedAt: new Date(`${workDate}T12:00:00.000Z`),
              isSimulation: false,
            },
          ],
          ...scheduleForDate(workDate),
        },
        referenceAt,
      );
    });
    const employeeBRows = [
      buildAnalyticalProjectionRow(
        {
          employeeWorkdayId: "b-1",
          expectationStatus: "EXPECTED",
          workDate: "2026-08-11",
          ...scheduleForDate("2026-08-11"),
        },
        referenceAt,
      ),
    ];

    const rows = [...employeeARows, ...employeeBRows];
    const employeeARate = calculateAttendanceRate(10, 0);
    const employeeBRate = calculateAttendanceRate(0, 1);
    assert.equal(employeeARate, 100);
    assert.equal(employeeBRate, 0);
    assert.notEqual((employeeARate + employeeBRate) / 2, 90.9);
    assert.equal(aggregateCompanyAttendanceRate(rows), 90.9);
  });

  it("keeps historical present workdays after assignment cancellation semantics", () => {
    const referenceAt = new Date("2026-07-25T10:00:00.000Z");
    const historicalRows = ["2026-07-05", "2026-07-06", "2026-07-07"].map((workDate, index) =>
      buildAnalyticalProjectionRow(
        {
          employeeWorkdayId: `hist-${index}`,
          expectationStatus: "EXPECTED",
          workDate,
          attendanceRecords:
            index < 2
              ? [
                  {
                    id: `ar-${index}`,
                    validationStatus: "VALID",
                    receivedAt: new Date(`${workDate}T12:00:00.000Z`),
                    isSimulation: false,
                  },
                ]
              : undefined,
          ...scheduleForDate(workDate),
        },
        index < 2 ? referenceAt : new Date("2026-07-08T10:00:00.000Z"),
      ),
    );

    const cancelledFuture = buildAnalyticalProjectionRow(
      {
        employeeWorkdayId: "future-cancelled",
        expectationStatus: "CANCELLED",
        workDate: "2026-07-21",
        ...scheduleForDate("2026-07-21"),
      },
      referenceAt,
    );

    const summary = aggregateProjectionSummary([...historicalRows, cancelledFuture]);
    assert.equal(summary.presentWorkdays, 2);
    assert.equal(summary.absentWorkdays, 1);
    assert.equal(summary.cancelledWorkdays, 1);
  });

  it("maps NO_CHECK_IN compatibility to ABSENT effective state filter", () => {
    const normalized = normalizeStatisticsFilters({ validationStatus: "NO_CHECK_IN" });
    assert.equal(normalized.effectiveState, "ABSENT");
    assert.equal(normalized.validationStatus, undefined);
  });

  it("matches SQL precedence contract for cancelled, justified, expected and present", () => {
    const closedReference = new Date("2026-08-12T10:00:00.000Z");
    const schedule = scheduleForDate("2026-08-10");
    assert.equal(
      deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: "CANCELLED" },
        hasAttendance: true,
        ...schedule,
        referenceAt: closedReference,
      }),
      "CANCELLED",
    );
    assert.equal(
      deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: "JUSTIFIED" },
        hasAttendance: false,
        ...schedule,
        referenceAt: closedReference,
      }),
      "JUSTIFIED",
    );
    assert.equal(
      deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: "EXPECTED" },
        hasAttendance: true,
        ...schedule,
        referenceAt: closedReference,
      }),
      "PRESENT",
    );
    assert.equal(
      deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: "EXPECTED" },
        hasAttendance: false,
        ...schedule,
        referenceAt: new Date("2026-08-10T20:00:00.000Z"),
      }),
      "EXPECTED",
    );
    assert.equal(
      deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: "EXPECTED" },
        hasAttendance: false,
        ...schedule,
        referenceAt: closedReference,
      }),
      "ABSENT",
    );
  });

  it("counts overnight attendance once on original workDate", () => {
    const referenceAt = new Date("2026-08-11T08:00:00.000Z");
    const row = buildAnalyticalProjectionRow(
      {
        employeeWorkdayId: "overnight",
        expectationStatus: "EXPECTED",
        workDate: "2026-08-10",
        expectedStartAt: "2026-08-10T22:00:00.000Z",
        expectedEndAt: "2026-08-11T06:00:00.000Z",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 20,
        attendanceRecords: [
          {
            id: "overnight-ar",
            validationStatus: "VALID",
            receivedAt: new Date("2026-08-10T22:00:00.000Z"),
            checkoutAt: new Date("2026-08-11T06:00:00.000Z"),
            extraWorkedMinutes: 30,
            isSimulation: false,
          },
        ],
      },
      referenceAt,
    );

    assert.equal(row.workDate, "2026-08-10");
    assert.equal(row.effectiveState, "PRESENT");
    assert.equal(row.workedMinutes, 480);
    assert.equal(row.overtimeMinutes, 30);
  });

  it("aggregates overtime minutes exactly from persisted values", () => {
    const referenceAt = new Date("2026-08-12T10:00:00.000Z");
    const rows = [60, 0, 30].map((extraWorkedMinutes, index) => {
      const workDate = `2026-08-${10 + index}`;
      return buildAnalyticalProjectionRow(
        {
          employeeWorkdayId: `ot-${index}`,
          expectationStatus: "EXPECTED",
          workDate,
          attendanceRecords: [
            {
              id: `ot-ar-${index}`,
              validationStatus: "VALID",
              receivedAt: new Date(`${workDate}T12:00:00.000Z`),
              checkoutAt: new Date(`${workDate}T21:00:00.000Z`),
              extraWorkedMinutes,
              isSimulation: false,
            },
          ],
          ...scheduleForDate(workDate),
        },
        referenceAt,
      );
    });

    const summary = aggregateProjectionSummary(rows);
    assert.equal(summary.overtimeMinutes, 90);
    assert.equal(summary.presentWorkdays, 3);
  });

  it("excludes justified workdays from attendance denominator", () => {
    const counts = deriveWorkdayStateCounts(["JUSTIFIED", "PRESENT", "ABSENT"]);
    assert.equal(counts.justifiedWorkdays, 1);
    assert.equal(counts.attendanceRequiredWorkdays, 2);
    assert.equal(calculateAttendanceRate(counts.presentWorkdays, counts.absentWorkdays), 50);
  });
});
