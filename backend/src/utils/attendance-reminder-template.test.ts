import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAttendanceReminderTemplateVariables } from "./attendance-reminder-template";

describe("buildAttendanceReminderTemplateVariables", () => {
  const candidate = {
    operationId: "op-1",
    employeeId: "emp-1",
    employeeName: "Ana Pérez",
    employeePhoneNumber: "+5491112345678",
    serviceName: "Carrefour Caballito",
    serviceAddress: "Av. Rivadavia 5108",
    serviceLocality: "Caballito",
    scheduledStart: "2026-06-23T14:00:00.000Z",
    scheduledEnd: "2026-06-23T22:00:00.000Z",
  };

  const serviceReference = "Carrefour Caballito - Av. Rivadavia 5108 - Caballito";

  it("maps arrival reminder variables with canonical service reference", () => {
    const variables = buildAttendanceReminderTemplateVariables(
      candidate,
      "ARRIVAL_REMINDER_15_MIN",
      "America/Argentina/Buenos_Aires",
    );

    assert.equal(variables["1"], "Ana Pérez");
    assert.equal(variables["2"], serviceReference);
    assert.match(variables["3"], /^\d{2}:\d{2}$/);
  });

  it("maps exit reminder variables using scheduled end", () => {
    const variables = buildAttendanceReminderTemplateVariables(
      candidate,
      "EXIT_REMINDER_15_MIN",
      "America/Argentina/Buenos_Aires",
    );

    assert.equal(variables["1"], "Ana Pérez");
    assert.equal(variables["2"], serviceReference);
    assert.match(variables["3"], /^\d{2}:\d{2}$/);
  });

  it("maps no-check-in-at-start variables with canonical service reference", () => {
    const variables = buildAttendanceReminderTemplateVariables(
      candidate,
      "NO_CHECKIN_AT_START",
      "America/Argentina/Buenos_Aires",
    );

    assert.equal(variables["1"], "Ana Pérez");
    assert.equal(variables["2"], serviceReference);
    assert.equal(variables["3"], undefined);
  });

  it("maps attendance confirmation reminder variables with canonical service reference", () => {
    const variables = buildAttendanceReminderTemplateVariables(
      candidate,
      "ATTENDANCE_CONFIRMATION_REMINDER",
      "America/Argentina/Buenos_Aires",
    );

    assert.equal(variables["1"], "Ana Pérez");
    assert.equal(variables["2"], serviceReference);
    assert.match(variables["3"], /^\d{2}\/\d{2}\/\d{4}$/);
    assert.match(variables["4"], /^\d{2}:\d{2}$/);
  });

  it("falls back to service name when address and locality are missing", () => {
    const variables = buildAttendanceReminderTemplateVariables(
      {
        ...candidate,
        serviceAddress: null,
        serviceLocality: null,
      },
      "ARRIVAL_REMINDER_15_MIN",
      "America/Argentina/Buenos_Aires",
    );

    assert.equal(variables["2"], "Carrefour Caballito");
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
