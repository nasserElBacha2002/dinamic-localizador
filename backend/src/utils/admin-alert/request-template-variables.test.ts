import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAbsenceRequestAlertTitle,
  buildAdminRequestAlertTemplateVariables,
  formatAbsenceRequestPeriodDisplay,
} from "./request-template-variables";

describe("buildAbsenceRequestAlertTitle", () => {
  it("prefixes absence type name", () => {
    assert.equal(buildAbsenceRequestAlertTitle("Vacaciones"), "Solicitud de vacaciones");
  });

  it("avoids duplicating Solicitud de prefix", () => {
    assert.equal(
      buildAbsenceRequestAlertTitle("Solicitud de licencia médica"),
      "Solicitud de licencia médica",
    );
  });
});

describe("formatAbsenceRequestPeriodDisplay", () => {
  it("formats multi-day range in DD/MM/YYYY", () => {
    assert.equal(
      formatAbsenceRequestPeriodDisplay("2026-09-01", "2026-09-07"),
      "01/09/2026 – 07/09/2026",
    );
  });

  it("omits redundant range for single day", () => {
    assert.equal(formatAbsenceRequestPeriodDisplay("2026-09-03", "2026-09-03"), "03/09/2026");
  });
});

describe("buildAdminRequestAlertTemplateVariables", () => {
  it("builds vacation pending review variables", () => {
    const vars = buildAdminRequestAlertTemplateVariables({
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
    for (const key of ["1", "2", "3", "4"]) {
      assert.equal(typeof vars[key], "string");
      assert.ok(vars[key].length > 0);
      assert.notEqual(vars[key], "—");
    }
  });

  it("builds single-day study leave variables", () => {
    const vars = buildAdminRequestAlertTemplateVariables({
      employeeName: "Juan Pérez",
      absenceTypeName: "Día de estudio",
      startDate: "2026-09-03",
      endDate: "2026-09-03",
      statusLabel: "Pendiente de revisión",
    });

    assert.equal(vars["1"], "Solicitud de día de estudio");
    assert.equal(vars["2"], "Juan Pérez");
    assert.equal(vars["3"], "03/09/2026");
    assert.equal(vars["4"], "Pendiente de revisión");
  });
});
