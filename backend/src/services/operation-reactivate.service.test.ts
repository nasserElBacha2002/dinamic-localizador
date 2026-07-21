import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { operationRepository } from "../repositories/operation.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const COMPANY_ID = "company-1";
const OPERATION_ID = "operation-1";

const cancelledOperation = {
  id: OPERATION_ID,
  serviceId: "service-1",
  operationKind: "ONE_TIME" as const,
  scheduledStart: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  scheduledEnd: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
  earlyToleranceMinutes: 60,
  lateToleranceMinutes: 15,
  status: "CANCELLED" as const,
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("operationService.reactivate", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("reactivates a cancelled ONE_TIME operation to SCHEDULED", async () => {
    setupUnitTestEnv();
    const { operationService } = await import("./operation.service");
    const { auditService } = await import("./audit.service");

    mock.method(operationRepository, "findById", async () => cancelledOperation);
    mock.method(operationRepository, "reactivateFromCancelled", async () => ({
      ...cancelledOperation,
      status: "SCHEDULED" as const,
    }));
    mock.method(operationRepository, "update", async () => ({
      ...cancelledOperation,
      status: "SCHEDULED" as const,
    }));
    let auditAction = "";
    mock.method(auditService, "log", async (_companyId, input) => {
      auditAction = input.action;
    });

    const result = await operationService.reactivate(COMPANY_ID, OPERATION_ID, "user-1");
    assert.equal(result.status, "SCHEDULED");
    assert.equal(auditAction, "reactivate");
  });

  it("rejects reactivation when operation is not cancelled", async () => {
    setupUnitTestEnv();
    const { operationService } = await import("./operation.service");

    mock.method(operationRepository, "findById", async () => ({
      ...cancelledOperation,
      status: "SCHEDULED" as const,
    }));

    await assert.rejects(
      () => operationService.reactivate(COMPANY_ID, OPERATION_ID, "user-1"),
      (error: unknown) =>
        error instanceof AppError && error.code === "OPERATION_NOT_CANCELLED",
    );
  });

  it("rejects reactivation when operation is missing", async () => {
    setupUnitTestEnv();
    const { operationService } = await import("./operation.service");

    mock.method(operationRepository, "findById", async () => null);

    await assert.rejects(
      () => operationService.reactivate(COMPANY_ID, OPERATION_ID, "user-1"),
      (error: unknown) => error instanceof AppError && error.code === "OPERATION_NOT_FOUND",
    );
  });

  it("treats concurrent lose as OPERATION_NOT_CANCELLED", async () => {
    setupUnitTestEnv();
    const { operationService } = await import("./operation.service");

    mock.method(operationRepository, "findById", async () => cancelledOperation);
    mock.method(operationRepository, "reactivateFromCancelled", async () => null);

    await assert.rejects(
      () => operationService.reactivate(COMPANY_ID, OPERATION_ID, "user-1"),
      (error: unknown) =>
        error instanceof AppError && error.code === "OPERATION_NOT_CANCELLED",
    );
  });
});
