import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOperationAssignmentAssignedTemplateVariables } from "./assigned-template-variables";

describe("buildOperationAssignmentAssignedTemplateVariables", () => {
  it("formats date DD/MM/YYYY and time HH:mm in BOT timezone", () => {
    const vars = buildOperationAssignmentAssignedTemplateVariables({
      employeeFirstName: "Ana",
      serviceName: "Obra Norte",
      serviceAddress: "Calle Falsa 123",
      serviceLocality: "CABA",
      // 2026-08-11 12:00 UTC → 09:00 America/Argentina/Buenos_Aires
      scheduledStart: "2026-08-11T12:00:00.000Z",
      timeZone: "America/Argentina/Buenos_Aires",
    });

    assert.equal(vars["1"], "Ana");
    assert.equal(vars["2"], "Obra Norte - Calle Falsa 123 - CABA");
    assert.equal(vars["3"], "11/08/2026");
    assert.equal(vars["4"], "09:00");
  });

  it("uses service name alone when address/locality empty", () => {
    const vars = buildOperationAssignmentAssignedTemplateVariables({
      employeeFirstName: "Luis",
      serviceName: "Planta",
      scheduledStart: "2026-01-15T18:30:00.000Z",
      timeZone: "America/Argentina/Buenos_Aires",
    });

    assert.equal(vars["1"], "Luis");
    assert.equal(vars["2"], "Planta");
    assert.equal(vars["3"], "15/01/2026");
    assert.equal(vars["4"], "15:30");
  });
});
