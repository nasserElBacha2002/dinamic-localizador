import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

const baseSettings = {
  companyId: "company-1",
  adminAlertsEnabled: true,
  attendanceThresholdAlertsEnabled: true,
  attendanceAlertThresholdPercent: 80,
  attendanceAlertWindowDays: 30,
  attendanceAlertMinimumWorkdays: 5,
  attendanceAlertCooldownDays: 7,
  attendanceAlertConfigVersion: 1,
};

describe("attendanceThresholdAlertService.evaluateEmployee", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("baselines first evaluation without alerting even when BELOW", async () => {
    const { companySettingsRepository } = await import(
      "../repositories/company-settings.repository"
    );
    const { attendanceAlertMetricsRepository } = await import(
      "../repositories/attendance-alert-metrics.repository"
    );
    const { attendanceAlertStateRepository } = await import(
      "../repositories/attendance-alert-state.repository"
    );
    const { attendanceThresholdAlertService } = await import(
      "./attendance-threshold-alert.service"
    );
    const { adminAlertService } = await import("./admin-alert.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => baseSettings);
    mock.method(attendanceAlertMetricsRepository, "getEmployeeWindowMetrics", async () => ({
      companyId: "company-1",
      employeeId: "emp-1",
      employeeName: "Juan",
      presentWorkdays: 3,
      absentWorkdays: 7,
      evaluatedWorkdays: 10,
      preciseRate: 30,
      displayRate: 30,
    }));
    mock.method(attendanceAlertStateRepository, "findByEmployee", async () => null);
    let upserted: Record<string, unknown> | null = null;
    mock.method(attendanceAlertStateRepository, "upsertState", async (input) => {
      upserted = input as unknown as Record<string, unknown>;
      return { id: "state-1", ...(input as object) };
    });
    const emitMock = mock.method(adminAlertService, "emit", async () => ({
      enqueued: 1,
      dedupSkipped: 0,
      recipientSkipped: 0,
    }));

    const result = await attendanceThresholdAlertService.evaluateEmployee(
      "company-1",
      "emp-1",
    );

    assert.equal(result?.transition, "BASELINE");
    assert.equal(result?.alerted, false);
    assert.equal(upserted?.currentBand, "BELOW");
    assert.equal(emitMock.mock.callCount(), 0);
  });

  it("alerts on ABOVE → BELOW crossing and skips stay-below", async () => {
    const { companySettingsRepository } = await import(
      "../repositories/company-settings.repository"
    );
    const { attendanceAlertMetricsRepository } = await import(
      "../repositories/attendance-alert-metrics.repository"
    );
    const { attendanceAlertStateRepository } = await import(
      "../repositories/attendance-alert-state.repository"
    );
    const { attendanceThresholdAlertService } = await import(
      "./attendance-threshold-alert.service"
    );
    const { adminAlertService } = await import("./admin-alert.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => baseSettings);
    mock.method(attendanceAlertMetricsRepository, "getEmployeeWindowMetrics", async () => ({
      companyId: "company-1",
      employeeId: "emp-1",
      employeeName: "Juan",
      presentWorkdays: 7,
      absentWorkdays: 3,
      evaluatedWorkdays: 10,
      preciseRate: 70,
      displayRate: 70,
    }));
    mock.method(attendanceAlertStateRepository, "findByEmployee", async () => ({
      id: "s1",
      companyId: "company-1",
      employeeId: "emp-1",
      currentBand: "ABOVE_OR_EQUAL",
      lastRate: 85,
      lastPresentWorkdays: 8,
      lastAbsentWorkdays: 2,
      lastEvaluatedWorkdays: 10,
      lastEvaluatedAt: new Date().toISOString(),
      lastCrossedBelowAt: null,
      lastAlertedAt: null,
      crossingSequence: 0,
      pendingAlertCrossingSequence: null,
      pendingAlertOccurredAt: null,
      pendingAlertRate: null,
      pendingAlertEvaluatedWorkdays: null,
      configVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(attendanceAlertStateRepository, "upsertState", async (input) => ({
      id: "s1",
      ...(input as object),
    }));
    mock.method(attendanceAlertStateRepository, "clearPendingAlert", async () => undefined);
    const emitMock = mock.method(adminAlertService, "emit", async () => ({
      enqueued: 1,
      dedupSkipped: 0,
      recipientSkipped: 0,
    }));

    const crossing = await attendanceThresholdAlertService.evaluateEmployee(
      "company-1",
      "emp-1",
    );
    assert.equal(crossing?.transition, "CROSSING_BELOW");
    assert.equal(crossing?.alerted, true);
    assert.equal(emitMock.mock.callCount(), 1);

    mock.method(attendanceAlertStateRepository, "findByEmployee", async () => ({
      id: "s1",
      companyId: "company-1",
      employeeId: "emp-1",
      currentBand: "BELOW",
      lastRate: 70,
      lastPresentWorkdays: 7,
      lastAbsentWorkdays: 3,
      lastEvaluatedWorkdays: 10,
      lastEvaluatedAt: new Date().toISOString(),
      lastCrossedBelowAt: new Date().toISOString(),
      lastAlertedAt: new Date().toISOString(),
      crossingSequence: 1,
      pendingAlertCrossingSequence: null,
      pendingAlertOccurredAt: null,
      pendingAlertRate: null,
      pendingAlertEvaluatedWorkdays: null,
      configVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(attendanceAlertMetricsRepository, "getEmployeeWindowMetrics", async () => ({
      companyId: "company-1",
      employeeId: "emp-1",
      employeeName: "Juan",
      presentWorkdays: 6,
      absentWorkdays: 4,
      evaluatedWorkdays: 10,
      preciseRate: 60,
      displayRate: 60,
    }));

    const stay = await attendanceThresholdAlertService.evaluateEmployee("company-1", "emp-1");
    assert.equal(stay?.transition, "STAY_BELOW");
    assert.equal(stay?.alerted, false);
    assert.equal(emitMock.mock.callCount(), 1);
  });

  it("skips WhatsApp during cooldown on technical re-cross", async () => {
    const { companySettingsRepository } = await import(
      "../repositories/company-settings.repository"
    );
    const { attendanceAlertMetricsRepository } = await import(
      "../repositories/attendance-alert-metrics.repository"
    );
    const { attendanceAlertStateRepository } = await import(
      "../repositories/attendance-alert-state.repository"
    );
    const { attendanceThresholdAlertService } = await import(
      "./attendance-threshold-alert.service"
    );
    const { adminAlertService } = await import("./admin-alert.service");

    const now = new Date("2026-08-10T12:00:00.000Z");
    mock.method(companySettingsRepository, "findByCompanyId", async () => baseSettings);
    mock.method(attendanceAlertMetricsRepository, "getEmployeeWindowMetrics", async () => ({
      companyId: "company-1",
      employeeId: "emp-1",
      employeeName: "Juan",
      presentWorkdays: 7,
      absentWorkdays: 3,
      evaluatedWorkdays: 10,
      preciseRate: 70,
      displayRate: 70,
    }));
    mock.method(attendanceAlertStateRepository, "findByEmployee", async () => ({
      id: "s1",
      companyId: "company-1",
      employeeId: "emp-1",
      currentBand: "ABOVE_OR_EQUAL",
      lastRate: 82,
      lastPresentWorkdays: 8,
      lastAbsentWorkdays: 2,
      lastEvaluatedWorkdays: 10,
      lastEvaluatedAt: now.toISOString(),
      lastCrossedBelowAt: "2026-08-09T12:00:00.000Z",
      lastAlertedAt: "2026-08-09T12:00:00.000Z",
      crossingSequence: 1,
      pendingAlertCrossingSequence: null,
      pendingAlertOccurredAt: null,
      pendingAlertRate: null,
      pendingAlertEvaluatedWorkdays: null,
      configVersion: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }));
    mock.method(attendanceAlertStateRepository, "upsertState", async (input) => ({
      id: "s1",
      ...(input as object),
    }));
    const emitMock = mock.method(adminAlertService, "emit", async () => ({
      enqueued: 1,
      dedupSkipped: 0,
      recipientSkipped: 0,
    }));

    const result = await attendanceThresholdAlertService.evaluateEmployee(
      "company-1",
      "emp-1",
      now,
    );
    assert.equal(result?.transition, "CROSSING_BELOW_COOLDOWN");
    assert.equal(result?.alerted, false);
    assert.equal(emitMock.mock.callCount(), 0);
  });

  it("rebaselines on config version mismatch without alert", async () => {
    const { companySettingsRepository } = await import(
      "../repositories/company-settings.repository"
    );
    const { attendanceAlertMetricsRepository } = await import(
      "../repositories/attendance-alert-metrics.repository"
    );
    const { attendanceAlertStateRepository } = await import(
      "../repositories/attendance-alert-state.repository"
    );
    const { attendanceThresholdAlertService } = await import(
      "./attendance-threshold-alert.service"
    );
    const { adminAlertService } = await import("./admin-alert.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      ...baseSettings,
      attendanceAlertConfigVersion: 3,
      attendanceAlertThresholdPercent: 85,
    }));
    mock.method(attendanceAlertMetricsRepository, "getEmployeeWindowMetrics", async () => ({
      companyId: "company-1",
      employeeId: "emp-1",
      employeeName: "Juan",
      presentWorkdays: 7,
      absentWorkdays: 3,
      evaluatedWorkdays: 10,
      preciseRate: 70,
      displayRate: 70,
    }));
    mock.method(attendanceAlertStateRepository, "findByEmployee", async () => ({
      id: "s1",
      companyId: "company-1",
      employeeId: "emp-1",
      currentBand: "ABOVE_OR_EQUAL",
      lastRate: 90,
      lastPresentWorkdays: 9,
      lastAbsentWorkdays: 1,
      lastEvaluatedWorkdays: 10,
      lastEvaluatedAt: new Date().toISOString(),
      lastCrossedBelowAt: null,
      lastAlertedAt: null,
      crossingSequence: 0,
      pendingAlertCrossingSequence: null,
      pendingAlertOccurredAt: null,
      pendingAlertRate: null,
      pendingAlertEvaluatedWorkdays: null,
      configVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(attendanceAlertStateRepository, "upsertState", async (input) => ({
      id: "s1",
      ...(input as object),
    }));
    const emitMock = mock.method(adminAlertService, "emit", async () => ({
      enqueued: 1,
      dedupSkipped: 0,
      recipientSkipped: 0,
    }));

    const result = await attendanceThresholdAlertService.evaluateEmployee(
      "company-1",
      "emp-1",
    );
    assert.equal(result?.transition, "REBASELINE_CONFIG");
    assert.equal(result?.alerted, false);
    assert.equal(emitMock.mock.callCount(), 0);
  });
});
