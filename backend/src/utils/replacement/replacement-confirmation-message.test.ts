import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatReplacementAssignmentConfirmation } from "./replacement-confirmation-message";

describe("formatReplacementAssignmentConfirmation", () => {
  it("formats start time in America/Argentina/Buenos_Aires", () => {
    const message = formatReplacementAssignmentConfirmation({
      candidateName: "Ana",
      serviceName: "Farmacia Central",
      workDate: "2026-11-24",
      expectedStartAt: "2026-11-24T15:00:00.000Z",
      timezone: "America/Argentina/Buenos_Aires",
    });
    assert.match(message, /2026-11-24/);
    assert.doesNotMatch(message, /T15:00:00/);
    assert.match(message, /12:00/);
  });

  it("formats start time in a configurable operation timezone", () => {
    const message = formatReplacementAssignmentConfirmation({
      candidateName: "Luis",
      serviceName: "Depósito Norte",
      workDate: "2026-11-24",
      expectedStartAt: "2026-11-24T15:00:00.000Z",
      timezone: "America/Mexico_City",
    });
    assert.match(message, /09:00/);
  });
});