import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEmployeeAbsenceAvailabilityStatus } from "../domain/absence-operational-effects";

describe("availability interval status resolution", () => {
  it("marks unavailable when approved covering", () => {
    assert.equal(
      resolveEmployeeAbsenceAvailabilityStatus({
        employeeActive: true,
        hasApprovedCovering: true,
        hasPendingOrNeedsInfoCovering: false,
        hasPartialDayCovering: false,
      }),
      "UNAVAILABLE",
    );
  });

  it("marks partial when approved partial covering", () => {
    assert.equal(
      resolveEmployeeAbsenceAvailabilityStatus({
        employeeActive: true,
        hasApprovedCovering: true,
        hasPendingOrNeedsInfoCovering: false,
        hasPartialDayCovering: true,
      }),
      "PARTIALLY_UNAVAILABLE",
    );
  });

  it("marks provisional when pending covering only", () => {
    assert.equal(
      resolveEmployeeAbsenceAvailabilityStatus({
        employeeActive: true,
        hasApprovedCovering: false,
        hasPendingOrNeedsInfoCovering: true,
        hasPartialDayCovering: false,
      }),
      "PROVISIONALLY_UNAVAILABLE",
    );
  });

  it("marks unavailable when employee inactive", () => {
    assert.equal(
      resolveEmployeeAbsenceAvailabilityStatus({
        employeeActive: false,
        hasApprovedCovering: false,
        hasPendingOrNeedsInfoCovering: false,
        hasPartialDayCovering: false,
      }),
      "UNAVAILABLE",
    );
  });
});
