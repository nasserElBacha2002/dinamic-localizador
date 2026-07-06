import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAttendanceReminderTemplateVariables } from "./attendance-reminder-template";

describe("buildAttendanceReminderTemplateVariables", () => {
  const candidate = {
    operationId: "inv-1",
    employeeId: "emp-1",
    employeeName: "Ana Pérez",
    employeePhoneNumber: "+5491112345678",
    serviceName: "Sucursal Centro",
    scheduledStart: "2026-06-23T14:00:00.000Z",
    scheduledEnd: "2026-06-23T22:00:00.000Z",
  };

  it("maps arrival reminder variables", () => {
    const variables = buildAttendanceReminderTemplateVariables(
      candidate,
      "ARRIVAL_REMINDER_15_MIN",
      "America/Argentina/Buenos_Aires",
    );

    assert.equal(variables["1"], "Ana Pérez");
    assert.equal(variables["2"], "Sucursal Centro");
    assert.match(variables["3"], /^\d{2}:\d{2}$/);
  });

  it("maps exit reminder variables using scheduled end", () => {
    const variables = buildAttendanceReminderTemplateVariables(
      candidate,
      "EXIT_REMINDER_15_MIN",
      "America/Argentina/Buenos_Aires",
    );

    assert.equal(variables["1"], "Ana Pérez");
    assert.equal(variables["2"], "Sucursal Centro");
    assert.match(variables["3"], /^\d{2}:\d{2}$/);
  });

  it("maps no-check-in-at-start variables without schedule time", () => {
    const variables = buildAttendanceReminderTemplateVariables(
      candidate,
      "NO_CHECKIN_AT_START",
      "America/Argentina/Buenos_Aires",
    );

    assert.equal(variables["1"], "Ana Pérez");
    assert.equal(variables["2"], "Sucursal Centro");
    assert.equal(variables["3"], undefined);
  });

  it("throws when exit reminder has no scheduled end", () => {
    assert.throws(
      () =>
        buildAttendanceReminderTemplateVariables(
          { ...candidate, scheduledEnd: null },
          "EXIT_REMINDER_15_MIN",
          "America/Argentina/Buenos_Aires",
        ),
      /MISSING_SCHEDULE_TIME_FOR_REMINDER/,
    );
  });
});
