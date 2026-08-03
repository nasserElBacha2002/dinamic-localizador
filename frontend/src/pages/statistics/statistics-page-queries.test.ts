import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAttentionEmployeesFilters,
  buildLowCoverageOperationsFilters,
  buildIncidentServicesFilters,
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

  it("uses rankingMode eligibility filters without client minSample", () => {
    const attention = buildAttentionEmployeesFilters(baseFilters);
    const coverage = buildLowCoverageOperationsFilters(baseFilters);
    const incidents = buildIncidentServicesFilters(baseFilters);
    const topLate = buildTopLateEmployeesFilters(baseFilters);

    assert.equal(attention.page, 1);
    assert.equal(attention.limit, CHART_TOP_LIMIT);
    assert.equal(attention.sortBy, "incidentCount");
    assert.equal(attention.rankingMode, "attention_employees");
    assert.equal(attention.minSampleWorkdays, undefined);
    assert.equal(coverage.rankingMode, "low_coverage_operations");
    assert.equal(coverage.sortBy, "coverageRate");
    assert.equal(coverage.sortDirection, "asc");
    assert.equal(incidents.rankingMode, "incident_services");
    assert.equal(incidents.sortBy, "incidentCount");
    assert.equal(topLate.rankingMode, "late_employees");
    assert.equal(topLate.sortBy, "lateWorkdays");
    assert.equal(topLate.limit, 10);
  });

  it("marks workday detail export as on-demand export request", () => {
    const exportFilters = buildWorkdayDetailExportFilters(baseFilters);
    assert.equal(exportFilters.export, true);
    assert.equal(exportFilters.effectiveState, "ABSENT");
    assert.equal(exportFilters.operationKind, "RECURRING");
  });
});
