import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTopEmployeesByAttendanceFilters,
  buildTopLateEmployeesFilters,
  buildWorkdayDetailExportFilters,
  CHART_TOP_LIMIT,
} from "./statistics-page-queries";

describe("statistics page query builders", () => {
  const baseFilters = {
    dateFrom: "2026-08-01T00:00:00.000Z",
    dateTo: "2026-08-31T23:59:59.999Z",
    operationKind: "RECURRING" as const,
    effectiveState: "ABSENT" as const,
  };

  it("uses server-side top-N chart filters", () => {
    const topEmployees = buildTopEmployeesByAttendanceFilters(baseFilters);
    const topLate = buildTopLateEmployeesFilters(baseFilters);

    assert.equal(topEmployees.page, 1);
    assert.equal(topEmployees.limit, CHART_TOP_LIMIT);
    assert.equal(topEmployees.sortBy, "attendanceRate");
    assert.equal(topEmployees.sortDirection, "desc");
    assert.equal(topLate.sortBy, "lateWorkdays");
    assert.equal(topLate.limit, 10);
    assert.equal(topEmployees.operationKind, "RECURRING");
    assert.equal(topEmployees.effectiveState, "ABSENT");
  });

  it("marks workday detail export as on-demand export request", () => {
    const exportFilters = buildWorkdayDetailExportFilters(baseFilters);
    assert.equal(exportFilters.export, true);
    assert.equal(exportFilters.effectiveState, "ABSENT");
    assert.equal(exportFilters.operationKind, "RECURRING");
  });
});
