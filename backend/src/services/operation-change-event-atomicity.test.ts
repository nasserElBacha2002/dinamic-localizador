import assert from "node:assert/strict";
import sql from "mssql";
import { afterEach, describe, it, mock } from "node:test";
import { setTestPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { setOperationChangeEventBeforeInsertHookForTests } from "../repositories/operation-change-event.repository";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const OPERATION_ID = "00000000-0000-4000-8000-000000000002";
const SERVICE_ID = "00000000-0000-4000-8000-000000000003";

const baseOperation = {
  id: OPERATION_ID,
  serviceId: SERVICE_ID,
  operationKind: "ONE_TIME" as const,
  scheduledStart: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  scheduledEnd: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
  earlyToleranceMinutes: 60,
  lateToleranceMinutes: 15,
  earlyToleranceSource: "COMPANY_DEFAULT" as const,
  lateToleranceSource: "COMPANY_DEFAULT" as const,
  status: "SCHEDULED" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("operationService change-event transactional rollback", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    mock.restoreAll();
    setTestPool(null);
    setOperationChangeEventBeforeInsertHookForTests(undefined);
    for (const restore of restores.splice(0)) {
      restore();
    }
  });

  const useTestPool = () => {
    setTestPool({ connected: true } as sql.ConnectionPool);
  };

  const patchTransaction = (handlers?: { onCommit?: () => void; onRollback?: () => void }) => {
    const OriginalTransaction = sql.Transaction;
    class FakeTransaction {
      async begin(): Promise<void> {
        return undefined;
      }

      async commit(): Promise<void> {
        handlers?.onCommit?.();
      }

      async rollback(): Promise<void> {
        handlers?.onRollback?.();
      }
    }

    (sql as { Transaction: typeof sql.Transaction }).Transaction =
      FakeTransaction as unknown as typeof sql.Transaction;
    restores.push(() => {
      (sql as { Transaction: typeof sql.Transaction }).Transaction = OriginalTransaction;
    });
  };

  it("rolls back cancel when change-event insert fails", async () => {
    setupUnitTestEnv();
    useTestPool();

    let commitCalls = 0;
    let rollbackCalls = 0;
    let cancelWithTx = false;

    patchTransaction({
      onCommit: () => {
        commitCalls += 1;
      },
      onRollback: () => {
        rollbackCalls += 1;
      },
    });

    setOperationChangeEventBeforeInsertHookForTests(async () => {
      throw new Error("injected change-event failure");
    });

    const { operationRepository } = await import("../repositories/operation.repository");
    const { companySettingsRepository } = await import(
      "../repositories/company-settings.repository"
    );
    const { auditService } = await import("./audit.service");
    const { operationService } = await import("./operation.service");

    mock.method(operationRepository, "findById", async () => baseOperation);
    mock.method(operationRepository, "cancel", async (_c, _id, transaction) => {
      cancelWithTx = Boolean(transaction);
      return { ...baseOperation, status: "CANCELLED" as const };
    });
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(auditService, "log", async () => undefined);

    await assert.rejects(
      () => operationService.cancel(COMPANY_ID, OPERATION_ID, "user-1"),
      (error: unknown) =>
        error instanceof Error && error.message.includes("injected change-event failure"),
    );

    assert.equal(cancelWithTx, true);
    assert.equal(commitCalls, 0);
    assert.equal(rollbackCalls, 1);
  });
});

describe("operationAssignmentService coverage validation", () => {
  afterEach(() => {
    mock.restoreAll();
    setTestPool(null);
  });

  it("rejects coverage when replacedAssignmentId is missing", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { operationWorkDateService } = await import("./operation-work-date.service");
    const { operationAssignmentService } = await import("./operation-assignment.service");

    const companyId = "00000000-0000-4000-8000-000000000001";
    const operationId = "00000000-0000-4000-8000-000000000002";
    const employeeId = "00000000-0000-4000-8000-000000000003";

    mock.method(operationRepository, "findById", async () => ({
      id: operationId,
      status: "SCHEDULED",
      operationKind: "ONE_TIME",
      scheduledStart: "2026-07-10T20:00:00.000Z",
    }));
    mock.method(employeeRepository, "findById", async () => ({
      id: employeeId,
      active: true,
    }));
    mock.method(operationWorkDateService, "resolveOperationWorkDate", async () => "2026-07-10");

    await assert.rejects(
      () =>
        operationAssignmentService.assignEmployee(companyId, operationId, employeeId, {
          asCoverage: true,
          validFrom: "2026-07-10",
          validUntil: "2026-07-10",
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "COVERAGE_REPLACED_ASSIGNMENT_REQUIRED");
        return true;
      },
    );
  });

  it("rejects coverage when replaced assignment is not on the operation", async () => {
    setupUnitTestEnv();
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

    try {
      const { operationRepository } = await import("../repositories/operation.repository");
      const { employeeRepository } = await import("../repositories/employee.repository");
      const { operationWorkDateService } = await import("./operation-work-date.service");
      const { companySettingsRepository } = await import(
        "../repositories/company-settings.repository"
      );
      const { employeeDeactivationRepository } = await import(
        "../repositories/employee-deactivation.repository"
      );
      const { operationEmployeeRepository } = await import(
        "../repositories/operation-employee.repository"
      );
      const { operationAssignmentService } = await import("./operation-assignment.service");

      const companyId = "00000000-0000-4000-8000-000000000001";
      const operationId = "00000000-0000-4000-8000-000000000002";
      const employeeId = "00000000-0000-4000-8000-000000000003";
      const replacedId = "00000000-0000-4000-8000-000000000099";

      mock.method(operationRepository, "findById", async () => ({
        id: operationId,
        status: "SCHEDULED",
        operationKind: "ONE_TIME",
        scheduledStart: "2026-07-10T20:00:00.000Z",
      }));
      mock.method(employeeRepository, "findById", async () => ({
        id: employeeId,
        active: true,
      }));
      mock.method(operationWorkDateService, "resolveOperationWorkDate", async () => "2026-07-10");
      mock.method(companySettingsRepository, "findByCompanyId", async () => ({
        operationTimezone: "America/Argentina/Buenos_Aires",
      }));
      mock.method(employeeDeactivationRepository, "lockEmployeeForUpdate", async () => ({
        id: employeeId,
        active: true,
      }));
      mock.method(operationEmployeeRepository, "findByIdInTransaction", async () => null);

      await assert.rejects(
        () =>
          operationAssignmentService.assignEmployee(companyId, operationId, employeeId, {
            asCoverage: true,
            replacedAssignmentId: replacedId,
            validFrom: "2026-07-10",
            validUntil: "2026-07-10",
          }),
        (error: unknown) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.code, "COVERAGE_REPLACED_ASSIGNMENT_NOT_FOUND");
          return true;
        },
      );
    } finally {
      (sql as { Transaction: typeof sql.Transaction }).Transaction = OriginalTransaction;
    }
  });
});

describe("assignEmployeeSchema coverage", () => {
  it("requires replacedAssignmentId when asCoverage is true", async () => {
    const { assignEmployeeSchema } = await import("../schemas/assignment.schema");
    const parsed = assignEmployeeSchema.safeParse({
      employeeId: "00000000-0000-4000-8000-000000000003",
      asCoverage: true,
    });
    assert.equal(parsed.success, false);
  });

  it("accepts coverage with replacedAssignmentId", async () => {
    const { assignEmployeeSchema } = await import("../schemas/assignment.schema");
    const parsed = assignEmployeeSchema.safeParse({
      employeeId: "00000000-0000-4000-8000-000000000003",
      asCoverage: true,
      replacedAssignmentId: "00000000-0000-4000-8000-000000000099",
    });
    assert.equal(parsed.success, true);
  });
});
