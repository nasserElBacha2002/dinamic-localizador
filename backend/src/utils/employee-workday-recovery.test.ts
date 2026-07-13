import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { EmployeeWorkday } from "../types/workday";
import { isRecoverableCancelledExpectation } from "./employee-workday-recovery";

const baseWorkday = (overrides: Partial<EmployeeWorkday> = {}): EmployeeWorkday => ({
  id: "ew-1",
  companyId: "company-1",
  operationWorkdayId: "ow-1",
  employeeId: "emp-1",
  operationAssignmentId: "assign-old",
  expectationStatus: "CANCELLED",
  cancellationReason: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("isRecoverableCancelledExpectation", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("recovers CANCELLED + NULL when linked assignment is cancelled", async () => {
    mock.method(
      (await import("../repositories/operation-employee.repository")).operationEmployeeRepository,
      "findById",
      async () => ({
        id: "assign-old",
        cancelledAt: "2026-07-13T12:00:00.000Z",
      }),
    );

    const recoverable = await isRecoverableCancelledExpectation(
      "company-1",
      baseWorkday(),
      "assign-new",
      false,
    );

    assert.equal(recoverable, true);
  });

  it("recovers CANCELLED + NULL when there is no linked assignment", async () => {
    const recoverable = await isRecoverableCancelledExpectation(
      "company-1",
      baseWorkday({ operationAssignmentId: null }),
      "assign-new",
      false,
    );

    assert.equal(recoverable, true);
  });

  it("does not recover when attendance exists", async () => {
    const recoverable = await isRecoverableCancelledExpectation(
      "company-1",
      baseWorkday(),
      "assign-new",
      true,
    );

    assert.equal(recoverable, false);
  });

  it("does not recover when linked assignment is still active", async () => {
    mock.method(
      (await import("../repositories/operation-employee.repository")).operationEmployeeRepository,
      "findById",
      async () => ({
        id: "assign-old",
        cancelledAt: null,
      }),
    );

    const recoverable = await isRecoverableCancelledExpectation(
      "company-1",
      baseWorkday(),
      "assign-new",
      false,
    );

    assert.equal(recoverable, false);
  });

  it("does not recover SCHEDULE cancellations", async () => {
    const recoverable = await isRecoverableCancelledExpectation(
      "company-1",
      baseWorkday({ cancellationReason: "SCHEDULE" }),
      "assign-new",
      false,
    );

    assert.equal(recoverable, false);
  });
});
