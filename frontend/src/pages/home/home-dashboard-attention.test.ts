import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperationalIncidentDetailRow } from "../../types/statistics";
import {
  buildHomeAttentionViewModel,
  employeeAttentionSeverity,
  operationalIncidentTypeSeverity,
  operationalIncidentTypeWeight,
} from "./home-dashboard-attention";
import type { AttendanceByEmployeeRow } from "../../types/statistics";

const linkContext = { dateFrom: "2026-08-20T00:00:00.000Z", dateTo: "2026-08-20T23:59:59.999Z" };

describe("home dashboard attention", () => {
  it("prioritizes critical operational incident types", () => {
    assert.equal(operationalIncidentTypeSeverity("NOT_CONFIRMED_AND_ABSENT"), "critical");
    assert.ok(
      operationalIncidentTypeWeight("NOT_CONFIRMED_AND_ABSENT") >
        operationalIncidentTypeWeight("OPERATION_MODIFIED"),
    );
  });

  it("orders global day issues by severity", () => {
    const model = buildHomeAttentionViewModel({
      summary: {
        scheduledWorkdays: 10,
        attendanceRequiredWorkdays: 10,
        presentWorkdays: 5,
        absentWorkdays: 2,
        justifiedWorkdays: 0,
        expectedOpenWorkdays: 0,
        cancelledWorkdays: 0,
        attendanceRate: 0.5,
        absenceRate: 0.2,
        onTimeWorkdays: 4,
        lateWorkdays: 1,
        punctualityRate: 0.8,
        earlyDepartureWorkdays: 0,
        workedMinutes: 0,
        overtimeMinutes: 0,
        openAttendanceWorkdays: 0,
        outsideGeofenceCount: 0,
        pendingReviewCount: 3,
        rejectedCount: 0,
        manuallyAcceptedCount: 0,
        totalOperations: 1,
        incompleteCoverageOperations: 0,
        coverageRate: 1,
        hoursDataIncomplete: false,
      },
      unavailableWorkdays: 0,
      lowCoverageOperations: [],
      incidentDetails: [],
      attentionEmployees: [],
      linkContext,
    });

    assert.equal(model.globalIssues[0]?.id, "pending_review");
    assert.equal(model.isEmpty, false);
  });

  it("groups operational incidents and low coverage under the same operation", () => {
    const incident: OperationalIncidentDetailRow = {
      detailId: "d1",
      incidentType: "NOT_CONFIRMED",
      incidentLabel: "Sin confirmar antes del inicio",
      operationId: "op-1",
      operationalDate: "2026-08-20",
      serviceName: "Servicio Centro",
      serviceAddress: "Calle 1",
      workTeamName: null,
      employeeId: "emp-1",
      employeeName: "Ana",
      operationStatus: "SCHEDULED",
      operationKind: "ONE_TIME",
      confirmationStatus: "PENDING",
      checkInAt: null,
      checkOutAt: null,
      eventAt: null,
      origin: null,
      reason: null,
      actorUserId: null,
    };

    const model = buildHomeAttentionViewModel({
      lowCoverageOperations: [
        {
          operationId: "op-1",
          operationKind: "ONE_TIME",
          serviceName: "Servicio Centro",
          serviceAddress: "Calle 1",
          scheduledStart: "2026-08-20T08:00:00.000Z",
          scheduledWorkdays: 5,
          presentWorkdays: 2,
          absentWorkdays: 1,
          justifiedWorkdays: 0,
          expectedOpenWorkdays: 0,
          attendanceRate: 0.5,
          coverageRate: 0.4,
          onTimeWorkdays: 2,
          lateWorkdays: 0,
          punctualityRate: 1,
          workedMinutes: 0,
          overtimeMinutes: 0,
          operationalStatus: "IN_PROGRESS",
        },
      ],
      incidentDetails: [incident],
      attentionEmployees: [],
      linkContext,
    });

    assert.equal(model.operationGroups.length, 1);
    assert.equal(model.operationGroups[0]?.issues.length, 2);
    assert.equal(model.operationGroups[0]?.maxSeverity, "high");
  });

  it("derives employee severity from contractual counters, not labels", () => {
    const row: AttendanceByEmployeeRow = {
      employeeId: "e1",
      employeeName: "Test",
      phoneNumber: "",
      scheduledWorkdays: 1,
      presentWorkdays: 0,
      absentWorkdays: 0,
      justifiedWorkdays: 0,
      expectedOpenWorkdays: 0,
      attendanceRate: 0,
      onTimeWorkdays: 0,
      lateWorkdays: 0,
      punctualityRate: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      earlyDepartureWorkdays: 0,
      outsideGeofenceCount: 0,
      pendingReviewCount: 2,
      incidentCount: 1,
      primaryIncidentLabel: "Tardanzas",
      lastAttendanceDate: null,
    };
    assert.equal(employeeAttentionSeverity(row), "critical");
  });

  it("returns empty model when there are no attention signals", () => {
    const model = buildHomeAttentionViewModel({
      summary: {
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
      },
      unavailableWorkdays: 0,
      lowCoverageOperations: [],
      incidentDetails: [],
      attentionEmployees: [],
      linkContext,
    });

    assert.equal(model.isEmpty, true);
  });
});
