import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAbsenceApprovalSuccessMessage,
  buildMaterializationSuccessMessage,
  employeeWorkdayStateLabels,
  formatExpectedTimeRange,
  formatWorkdayDate,
  workdayStatusLabels,
} from "./operation-workday-display";

describe("operation-workday-display", () => {
  it("maps workday status labels in Spanish", () => {
    assert.equal(workdayStatusLabels.ACTIVE, "Programada");
    assert.equal(workdayStatusLabels.CANCELLED, "Cancelada");
  });

  it("formats workday date with weekday", () => {
    assert.equal(formatWorkdayDate("2026-07-13"), formatWorkdayDate("2026-07-13"));
    assert.match(formatWorkdayDate("2026-07-13"), /lun/i);
    assert.match(formatWorkdayDate("2026-07-13"), /13\/07\/2026/);
    assert.doesNotMatch(formatWorkdayDate("2026-07-13"), /12\/07\/2026/);
  });

  it("formats expected time range including overnight end", () => {
    const range = formatExpectedTimeRange({
      id: "wd-1",
      workDate: "2026-08-03",
      expectedStartAt: "2026-08-04T01:00:00.000Z",
      expectedEndAt: "2026-08-04T09:00:00.000Z",
      status: "ACTIVE",
      scheduledEmployeesCount: 1,
    });

    assert.match(range, /\d{2}:\d{2}–\d{2}:\d{2}/);
  });

  it("builds zero-change materialization feedback without collaborator claims", () => {
    const message = buildMaterializationSuccessMessage({
      operationId: "op-1",
      rangeStart: "2026-08-10",
      rangeEnd: "2026-08-11",
      operationWorkdaysCreated: 0,
      operationWorkdaysUpdated: 0,
      operationWorkdaysCancelled: 0,
      employeeWorkdaysCreated: 0,
      employeeWorkdaysReactivated: 0,
      employeeWorkdaysCancelled: 0,
      unchanged: 2,
    });

    assert.equal(message, "Jornadas actualizadas correctamente.");
    assert.doesNotMatch(message, /colaboradores incorporados/);
  });

  it("reports only truthful created and reactivated counters", () => {
    const message = buildMaterializationSuccessMessage({
      operationId: "op-1",
      rangeStart: "2026-08-10",
      rangeEnd: "2026-08-11",
      operationWorkdaysCreated: 2,
      operationWorkdaysUpdated: 0,
      operationWorkdaysCancelled: 0,
      employeeWorkdaysCreated: 1,
      employeeWorkdaysReactivated: 3,
      employeeWorkdaysCancelled: 0,
      unchanged: 0,
    });

    assert.match(message, /2 jornadas generadas/);
    assert.match(message, /1 colaboradores incorporados/);
    assert.match(message, /3 expectativas reactivadas/);
  });

  it("maps employee workday effective state labels in Spanish", () => {
    assert.equal(employeeWorkdayStateLabels.JUSTIFIED, "Justificado");
    assert.equal(employeeWorkdayStateLabels.ABSENT, "Ausente");
    assert.equal(employeeWorkdayStateLabels.PRESENT, "Con asistencia");
  });

  it("builds absence approval feedback with justified and conflict counters", () => {
    assert.match(
      buildAbsenceApprovalSuccessMessage({ justified: 8, attendanceConflicts: 1 }),
      /8 jornadas fueron justificadas/,
    );
    assert.match(
      buildAbsenceApprovalSuccessMessage({ justified: 8, attendanceConflicts: 1 }),
      /requiere revisión/,
    );
  });

  it("maps absence workday sync failure through error helper", async () => {
    const { isAbsenceWorkdaySyncError } = await import("../../utils/errors");
    const { ApiError } = await import("../../utils/errors");
    assert.equal(
      isAbsenceWorkdaySyncError(
        new ApiError(
          "La ausencia fue guardada, pero no se pudieron actualizar las jornadas.",
          "ABSENCE_WORKDAY_SYNC_FAILED",
          503,
        ),
      ),
      true,
    );
  });
});
