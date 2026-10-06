import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AttendanceStatisticsSummary } from "../../types/statistics";
import {
  buildHomeAttendanceBarChartRow,
  buildHomeAttendanceBarChartSeries,
  buildHomeAttendanceDistribution,
  buildHomeAttendanceLegendLine,
  buildHomeAttendanceStackModel,
  buildHomeOperationalIncidentBarData,
  buildHomeOperationalIncidentChartItems,
  isHomeAttendanceDistributionEmpty,
} from "./home-dashboard-charts";

const baseSummary = (): AttendanceStatisticsSummary => ({
  scheduledWorkdays: 10,
  attendanceRequiredWorkdays: 10,
  presentWorkdays: 4,
  absentWorkdays: 2,
  justifiedWorkdays: 1,
  expectedOpenWorkdays: 3,
  cancelledWorkdays: 0,
  attendanceRate: 0.4,
  absenceRate: 0.2,
  onTimeWorkdays: 3,
  lateWorkdays: 1,
  punctualityRate: 0.75,
  earlyDepartureWorkdays: 0,
  workedMinutes: 0,
  overtimeMinutes: 0,
  openAttendanceWorkdays: 0,
  outsideGeofenceCount: 0,
  pendingReviewCount: 0,
  rejectedCount: 0,
  manuallyAcceptedCount: 0,
  totalOperations: 2,
  incompleteCoverageOperations: 0,
  coverageRate: 1,
  hoursDataIncomplete: false,
  operationalIncidents: {
    operationsWithAnyIncident: 2,
    operationsWithCoverage: 1,
    coverageEvents: 1,
    modifiedOperations: 0,
    operationChangeEvents: 0,
    operationsWithUnconfirmedAssignments: 3,
    notConfirmedBeforeStart: 3,
    notConfirmedAndAbsent: 0,
    operationsWithIncompletePunches: 2,
    incompleteWorkdays: 2,
    missingCheckIn: 0,
    missingCheckOut: 0,
    noPunch: 0,
    evaluableOperations: 5,
    changeEventsReliableFrom: null,
    coverageEventsReliableHistorically: true,
  },
});

describe("home dashboard charts", () => {
  it("builds mutually exclusive attendance categories", () => {
    const items = buildHomeAttendanceDistribution(baseSummary());
    const total = items.reduce((sum, item) => sum + item.count, 0);
    assert.equal(total, 10);
  });

  it("builds stack model with scheduled total and non-zero segments only", () => {
    const stack = buildHomeAttendanceStackModel(baseSummary());
    assert.ok(stack);
    assert.equal(stack.total, 10);
    assert.equal(stack.segments.length, 4);
    assert.equal(
      stack.segments.reduce((sum, segment) => sum + segment.count, 0),
      10,
    );
  });

  it("marks attendance chart empty when there are no scheduled workdays", () => {
    const summary = {
      ...baseSummary(),
      scheduledWorkdays: 0,
      presentWorkdays: 0,
      absentWorkdays: 0,
      justifiedWorkdays: 0,
      expectedOpenWorkdays: 0,
    };
    assert.equal(isHomeAttendanceDistributionEmpty(summary), true);
    assert.equal(buildHomeAttendanceStackModel(summary), null);
  });

  it("filters and sorts operational incident categories by count desc", () => {
    const items = buildHomeOperationalIncidentChartItems(baseSummary().operationalIncidents);
    assert.ok(items.every((item) => item.count > 0));
    assert.equal(items[0]?.key, "not_confirmed");
    assert.equal(items[0]?.count, 3);
    for (let index = 1; index < items.length; index += 1) {
      assert.ok(items[index - 1].count >= items[index].count);
    }
  });

  it("returns empty incident chart items when metrics are missing", () => {
    assert.deepEqual(buildHomeOperationalIncidentChartItems(null), []);
  });

  it("builds bar chart row and series aligned with stack segments", () => {
    const stack = buildHomeAttendanceStackModel(baseSummary());
    assert.ok(stack);
    const row = buildHomeAttendanceBarChartRow(stack);
    assert.equal(row.present, 4);
    assert.equal(row.expected, 3);
    const series = buildHomeAttendanceBarChartSeries(stack);
    assert.equal(series.length, stack.segments.length);
    assert.ok(series.every((item) => item.color.endsWith(".6")));
  });

  it("builds legend line with counts and percentages", () => {
    const stack = buildHomeAttendanceStackModel(baseSummary());
    assert.ok(stack);
    assert.match(stack.legendLine, /Presentes 4 \(40%\)/);
    assert.match(
      buildHomeAttendanceLegendLine(0, stack.segments),
      /^$/,
    );
  });

  it("maps incident items to bar chart rows preserving keys", () => {
    const items = buildHomeOperationalIncidentChartItems(baseSummary().operationalIncidents);
    const rows = buildHomeOperationalIncidentBarData(items);
    assert.equal(rows[0]?.key, "not_confirmed");
    assert.equal(rows[0]?.operations, 3);
  });

  it("returns empty incident bar data when there are no incidents", () => {
    assert.deepEqual(
      buildHomeOperationalIncidentBarData([]),
      [],
    );
  });
});
