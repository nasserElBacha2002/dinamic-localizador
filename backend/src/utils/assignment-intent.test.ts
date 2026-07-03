import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isConfirmAttendanceIntent,
  isUnavailabilityIntent,
  isUpcomingAssignmentsIntent,
  isWorkdayQueryIntent,
  parseOptionalAssignmentSelection,
} from "./assignment-intent";

describe("isWorkdayQueryIntent", () => {
  it("detects workday query commands", () => {
    assert.equal(isWorkdayQueryIntent("mi jornada"), true);
    assert.equal(isWorkdayQueryIntent("hoy"), true);
    assert.equal(isWorkdayQueryIntent("qué tengo hoy"), true);
    assert.equal(isWorkdayQueryIntent("turno de hoy"), true);
    assert.equal(isWorkdayQueryIntent("mis turnos"), false);
  });
});

describe("isUpcomingAssignmentsIntent", () => {
  it("detects upcoming assignment commands", () => {
    assert.equal(isUpcomingAssignmentsIntent("mis turnos"), true);
    assert.equal(isUpcomingAssignmentsIntent("próximos inventarios"), true);
    assert.equal(isUpcomingAssignmentsIntent("agenda"), true);
    assert.equal(isUpcomingAssignmentsIntent("mi jornada"), false);
  });
});

describe("isConfirmAttendanceIntent", () => {
  it("detects confirmation commands including numbered selection", () => {
    assert.equal(isConfirmAttendanceIntent("confirmo asistencia"), true);
    assert.equal(isConfirmAttendanceIntent("confirmar turno"), true);
    assert.equal(isConfirmAttendanceIntent("confirmar 1"), true);
    assert.equal(isConfirmAttendanceIntent("no puedo asistir"), false);
  });
});

describe("isUnavailabilityIntent", () => {
  it("detects unavailability commands including numbered selection", () => {
    assert.equal(isUnavailabilityIntent("no puedo asistir"), true);
    assert.equal(isUnavailabilityIntent("no disponible"), true);
    assert.equal(isUnavailabilityIntent("no puedo turno 2"), true);
    assert.equal(isUnavailabilityIntent("confirmar turno"), false);
  });
});

describe("parseOptionalAssignmentSelection", () => {
  it("parses trailing numbers from commands", () => {
    assert.equal(parseOptionalAssignmentSelection("confirmo turno 2"), 2);
    assert.equal(parseOptionalAssignmentSelection("2"), 2);
    assert.equal(parseOptionalAssignmentSelection("confirmar turno"), null);
  });
});
