import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INCIDENT_FILTER_APPLICABILITY } from "./operational-incident-filters";

describe("INCIDENT_FILTER_APPLICABILITY", () => {
  it("does not apply incidentType to summary aggregates", () => {
    assert.deepEqual(INCIDENT_FILTER_APPLICABILITY.incidentType, []);
  });

  it("applies confirmationStatus only to confirmation and summary", () => {
    assert.deepEqual(
      [...INCIDENT_FILTER_APPLICABILITY.confirmationStatus].sort(),
      ["confirmation", "summary"].sort(),
    );
  });

  it("applies punchCompleteness only to punch and summary", () => {
    assert.deepEqual(
      [...INCIDENT_FILTER_APPLICABILITY.punchCompleteness].sort(),
      ["punch", "summary"].sort(),
    );
  });

  it("applies employee across coverage, confirmation, punch, change, and summary", () => {
    for (const family of ["coverage", "change", "confirmation", "punch", "summary"] as const) {
      assert.ok(
        INCIDENT_FILTER_APPLICABILITY.employee.includes(family),
        `employee should apply to ${family}`,
      );
    }
  });
});
