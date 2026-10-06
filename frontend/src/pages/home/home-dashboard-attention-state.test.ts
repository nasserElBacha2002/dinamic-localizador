import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeAttentionLoading,
  deriveShouldLoadIncidentDetails,
  deriveShouldLoadLowCoverage,
  resolveHomeAttentionPanelState,
  shouldShowAttentionEmptyState,
} from "./home-dashboard-attention-state";
import { buildHomeAttentionViewModel } from "./home-dashboard-attention";
import type { AttendanceStatisticsSummary } from "../../types/statistics";

const emptySummary: AttendanceStatisticsSummary = {
  scheduledWorkdays: 0,
  attendanceRequiredWorkdays: 0,
  presentWorkdays: 0,
  absentWorkdays: 0,
  justifiedWorkdays: 0,
  expectedOpenWorkdays: 0,
  cancelledWorkdays: 0,
  attendanceRate: 0,
  absenceRate: 0,
  onTimeWorkdays: 0,
  lateWorkdays: 0,
  punctualityRate: 0,
  earlyDepartureWorkdays: 0,
  workedMinutes: 0,
  overtimeMinutes: 0,
  openAttendanceWorkdays: 0,
  outsideGeofenceCount: 0,
  pendingReviewCount: 0,
  rejectedCount: 0,
  manuallyAcceptedCount: 0,
  totalOperations: 0,
  incompleteCoverageOperations: 0,
  coverageRate: 0,
  hoursDataIncomplete: false,
};

const linkContext = { dateFrom: "2026-08-20T00:00:00.000Z", dateTo: "2026-08-20T23:59:59.999Z" };

describe("home dashboard attention state", () => {
  it("does not require low coverage or incident details when summary has none", () => {
    assert.equal(deriveShouldLoadLowCoverage(emptySummary, true), false);
    assert.equal(deriveShouldLoadIncidentDetails(emptySummary, true), false);
  });

  it("ignores disabled conditional queries in aggregate loading", () => {
    assert.equal(
      computeAttentionLoading({
        summaryLoading: false,
        unavailableLoading: false,
        attentionEmployeesLoading: false,
        lowCoverageLoading: false,
        incidentDetailsLoading: false,
      }),
      false,
    );
  });

  it("does not show empty state when a source failed", () => {
    assert.equal(
      shouldShowAttentionEmptyState({
        loading: false,
        summaryFailed: false,
        anyEnabledSourceFailed: true,
        modelEmpty: true,
      }),
      false,
    );
  });

  it("shows empty state only when all sources succeeded and model is empty", () => {
    assert.equal(
      shouldShowAttentionEmptyState({
        loading: false,
        summaryFailed: false,
        anyEnabledSourceFailed: false,
        modelEmpty: true,
      }),
      true,
    );
  });

  it("returns error instead of empty when model is empty but a source failed", () => {
    const model = buildHomeAttentionViewModel({
      summary: emptySummary,
      unavailableWorkdays: 0,
      lowCoverageOperations: [],
      incidentDetails: [],
      attentionEmployees: [],
      linkContext,
    });
    const state = resolveHomeAttentionPanelState({
      loading: false,
      sourceErrors: ["No se pudieron cargar colaboradores"],
      model,
    });
    assert.equal(state.status, "error");
  });

  it("returns empty when model is empty and no errors", () => {
    const model = buildHomeAttentionViewModel({
      summary: emptySummary,
      unavailableWorkdays: 0,
      lowCoverageOperations: [],
      incidentDetails: [],
      attentionEmployees: [],
      linkContext,
    });
    const state = resolveHomeAttentionPanelState({
      loading: false,
      sourceErrors: [],
      model,
    });
    assert.equal(state.status, "empty");
  });
});
