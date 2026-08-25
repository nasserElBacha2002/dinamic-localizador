import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAdminAlertTemplateVariables,
  buildAdminOperationalAlertTemplateVariables,
} from "./template-variables";

describe("buildAdminOperationalAlertTemplateVariables", () => {
  it("builds EMPLOYEE_UNAVAILABLE copy without empty variables", () => {
    const vars = buildAdminOperationalAlertTemplateVariables("EMPLOYEE_UNAVAILABLE", {
      employeeName: "Juan Pérez",
      serviceName: "Carrefour Caballito",
      scheduledStart: "2026-08-25T11:00:00.000Z",
      operationTimezone: "America/Argentina/Buenos_Aires",
    });

    assert.equal(vars["1"], "No asistirá");
    assert.equal(vars["2"], "Juan Pérez");
    assert.match(vars["3"], /no podrá asistir/i);
    assert.match(vars["4"], /Carrefour Caballito/);
    assert.notEqual(vars["4"], "");
  });

  it("uses em dash for missing context on missing check-in", () => {
    const vars = buildAdminOperationalAlertTemplateVariables("MISSING_CHECKIN_AFTER_OPERATION", {
      employeeName: "Juan Pérez",
    });

    assert.equal(vars["1"], "Sin registro de llegada");
    assert.equal(vars["4"], "—");
  });

  it("builds FORWARDED_LOCATION_REJECTED security copy", () => {
    const vars = buildAdminOperationalAlertTemplateVariables("FORWARDED_LOCATION_REJECTED", {
      employeeName: "Juan Pérez",
      forwardedLocationDetail:
        "Ubicación marcada como reenviada. Flujo: CHECK_IN. MessageSid: SM1. Forwarded=true.",
    });

    assert.equal(vars["1"], "Ubicación reenviada");
    assert.equal(vars["2"], "Juan Pérez");
    assert.match(vars["3"], /MessageSid: SM1/);
    assert.equal(vars["4"], "—");
  });
});

describe("buildAdminAlertTemplateVariables REQUEST", () => {
  it("builds ABSENCE_REQUEST_PENDING via REQUEST category", () => {
    const vars = buildAdminAlertTemplateVariables("ABSENCE_REQUEST_PENDING", "REQUEST", {
      employeeName: "Juan Pérez",
      absenceTypeName: "Vacaciones",
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      statusLabel: "Pendiente de revisión",
    });

    assert.equal(vars["1"], "Solicitud de vacaciones");
    assert.equal(vars["2"], "Juan Pérez");
    assert.equal(vars["3"], "01/09/2026 – 07/09/2026");
    assert.equal(vars["4"], "Pendiente de revisión");
  });

  it("rejects operational payload for REQUEST category", () => {
    assert.throws(
      () =>
        buildAdminAlertTemplateVariables("EMPLOYEE_UNAVAILABLE", "REQUEST", {
          employeeName: "Juan Pérez",
        }),
      /AdminAlertRequestTemplatePayload/,
    );
  });
});
