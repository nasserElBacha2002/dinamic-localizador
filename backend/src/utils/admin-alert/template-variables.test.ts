import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAdminOperationalAlertTemplateVariables } from "./template-variables";

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

  it("uses em dash for missing context on forwarded location", () => {
    const vars = buildAdminOperationalAlertTemplateVariables("FORWARDED_LOCATION_REJECTED", {
      employeeName: "Juan Pérez",
    });

    assert.equal(vars["1"], "Ubicación reenviada");
    assert.equal(vars["4"], "—");
  });

  it("uses factual missing check-in wording", () => {
    const vars = buildAdminOperationalAlertTemplateVariables("MISSING_CHECKIN_AFTER_OPERATION", {
      employeeName: "Juan Pérez",
      serviceName: "Carrefour Caballito",
      scheduledStart: "2026-08-24T11:00:00.000Z",
      operationTimezone: "America/Argentina/Buenos_Aires",
    });

    assert.equal(vars["1"], "Sin registro de llegada");
    assert.match(vars["3"], /No existe registro de llegada/i);
    assert.doesNotMatch(vars["3"], /faltó|nunca llegó|no asistió/i);
  });
});
