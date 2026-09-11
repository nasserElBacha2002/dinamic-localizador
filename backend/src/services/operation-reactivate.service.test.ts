import assert from "node:assert/strict";
import sql from "mssql";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setTestPool } from "../database/connection";
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("operationService.reactivate", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    mock.restoreAll();
    setTestPool(null);
    for (const restore of restores.splice(0)) {
      restore();
    }
  });

  const useFakeTransaction = () => {
    setTestPool({ connected: true } as sql.ConnectionPool);
    const OriginalTransaction = sql.Transaction;
    class FakeTransaction {
      async begin(): Promise<void> {
        return undefined;
      }
      async commit(): Promise<void> {
        return undefined;
      }
      async rollback(): Promise<void> {
        return undefined;
      }
    }
    (sql as { Transaction: typeof sql.Transaction }).Transaction =
      FakeTransaction as unknown as typeof sql.Transaction;
    restores.push(() => {
      (sql as { Transaction: typeof sql.Transaction }).Transaction = OriginalTransaction;
    });
  };

  it("reactivates a cancelled ONE_TIME operation to SCHEDULED", async () => {
    setupUnitTestEnv();
    useFakeTransaction();
    const { operationService } = await import("./operation.service");
    const { auditService } = await import("./audit.service");
    const { companySettingsRepository } = await import(
      "../repositories/company-settings.repository"
    );
    const { operationChangeEventRepository } = await import(
      "../repositories/operation-change-event.repository"
    );

    mock.method(operationRepository, "findById", async () => cancelledOperation);
    mock.method(operationRepository, "reactivateFromCancelled", async () => ({
      ...cancelledOperation,
      status: "SCHEDULED" as const,
    }));
    mock.method(operationRepository, "update", async () => ({
      ...cancelledOperation,
      status: "SCHEDULED" as const,
    }));
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(operationChangeEventRepository, "insert", async () => undefined);
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
    useFakeTransaction();
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
