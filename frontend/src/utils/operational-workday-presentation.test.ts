import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCoveredSituationLabel,
  operationAbsenceBadgePresentationLabel,
  operationalWorkdaySituationLabels,
} from "./operational-workday-presentation";

describe("operational-workday-presentation", () => {
  it("uses consistent vacancy and covered labels", () => {
    assert.equal(
      formatCoveredSituationLabel("María Gómez"),
      `${operationalWorkdaySituationLabels.covered} · María Gómez`,
    );
    assert.equal(
      operationAbsenceBadgePresentationLabel({
        code: "REPLACEMENT_PENDING",
        label: "Reemplazo pendiente",
      }),
      operationalWorkdaySituationLabels.vacancyByAbsence,
    );
    assert.equal(
      operationAbsenceBadgePresentationLabel({
        code: "REPLACED",
        label: "Reemplazado",
      }),
      operationalWorkdaySituationLabels.coveredActive,
    );
  });
});
