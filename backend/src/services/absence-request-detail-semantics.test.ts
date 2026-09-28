import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

describe("absence-request getById error semantics (4B.3)", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const baseRequest = {
    id: "req-1",
    companyId: "company-1",
    employeeId: "emp-1",
    absenceTypeId: "type-1",
    startDate: "2026-09-01",
    endDate: "2026-09-01",
  };

  it("empty affected operations is a valid empty result", async () => {
    setupUnitTestEnv();
    mock.method(absenceRequestRepository, "findDetailById", async () => baseRequest);
    mock.method(absenceRequestRepository, "listEvents", async () => []);
    mock.method(absenceTypeRepository, "findById", async () => null);

    const { absenceOperationImpactService } = await import(
      "../services/absence-operation-impact.service"
    );
    mock.method(absenceOperationImpactService, "getOperationTimezone", async () => "America/Argentina/Buenos_Aires");
    mock.method(absenceOperationImpactService, "findAffectedOperations", async () => []);

    const { absenceRequestService } = await import("../services/absence-request.service");
    const detail = await absenceRequestService.getById("company-1", "req-1");
    assert.equal(detail.affectedOperations.length, 0);
    assert.equal(detail.affectedOperationsCount, 0);
    assert.equal(detail.balanceImpact, null);
  });

  it("repository/compute failure does not become empty success", async () => {
    setupUnitTestEnv();
    mock.method(absenceRequestRepository, "findDetailById", async () => baseRequest);
    mock.method(absenceRequestRepository, "listEvents", async () => []);
    mock.method(absenceTypeRepository, "findById", async () => null);

    const { absenceOperationImpactService } = await import(
      "../services/absence-operation-impact.service"
    );
    mock.method(absenceOperationImpactService, "getOperationTimezone", async () => "America/Argentina/Buenos_Aires");
    mock.method(absenceOperationImpactService, "findAffectedOperations", async () => {
      throw new Error("impact calc failed");
    });

    const { absenceRequestService } = await import("../services/absence-request.service");
    await assert.rejects(
      () => absenceRequestService.getById("company-1", "req-1"),
      (error: unknown) =>
        error instanceof AppError && error.code === "ABSENCE_AFFECTED_OPERATIONS_UNAVAILABLE",
    );
  });
});
