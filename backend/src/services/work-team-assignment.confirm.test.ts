import assert from "node:assert/strict";
import sql from "mssql";
import { afterEach, describe, it, mock } from "node:test";
import { setTestPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { hashWorkTeamMembers } from "../utils/work-team-snapshot-hash";

const buildEmployee = (id: string) => ({
  id,
  active: true,
  name: `Employee ${id}`,
  phoneNumber: `+54911000000${id.slice(-1)}`,
  employeeType: "fijo",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("workTeamAssignmentService.confirm rollback", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    mock.restoreAll();
    setTestPool(null);
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

  it("rolls back partial writes and marks batch FAILED in a separate transaction", async () => {
    setupUnitTestEnv();

    const employeeIds = ["emp-1", "emp-2", "emp-3"];
    const membersSnapshotHash = hashWorkTeamMembers(employeeIds);

    const rollbackCalls: number[] = [];
    const markFailedCalls: unknown[] = [];
    const batchItemCalls: unknown[] = [];
    const batchSourceCalls: unknown[] = [];
    let assignCalls = 0;
    let commitCalls = 0;

    useTestPool();
    patchTransaction({
      onCommit: () => {
        commitCalls += 1;
      },
      onRollback: () => {
        rollbackCalls.push(1);
      },
    });

    const { workTeamAssignmentBatchRepository } = await import(
      "../repositories/work-team-assignment-batch.repository"
    );
    const { operationRepository } = await import("../repositories/operation.repository");
    const { workTeamRepository } = await import("../repositories/work-team.repository");
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationAssignmentCore } = await import("./operation-assignment-core.service");
    const { workTeamAssignmentService } = await import("./work-team-assignment.service");

    mock.method(workTeamAssignmentBatchRepository, "expireStalePreviews", async () => undefined);
    mock.method(operationRepository, "findById", async () => ({
      id: "operation-1",
      companyId: "company-1",
      status: "SCHEDULED",
      operationKind: "RECURRING",
    }));

    mock.method(workTeamAssignmentBatchRepository, "findByIdForUpdate", async () => ({
      id: "batch-1",
      companyId: "company-1",
      operationId: "operation-1",
      status: "PREVIEWED",
      validFrom: "2026-07-13",
      validUntil: null,
      previewExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      requestedBy: "user-1",
    }));

    mock.method(workTeamAssignmentBatchRepository, "listBatchTeamsInTransaction", async () => [
      {
        workTeamId: "team-1",
        workTeamName: "Team",
        membersSnapshotHash,
        assignmentVersionSnapshot: 0,
      },
    ]);

    mock.method(workTeamRepository, "listByIdsInTransaction", async () => [
      {
        id: "team-1",
        isActive: true,
        assignmentVersion: 0,
      },
    ]);

    mock.method(workTeamRepository, "listMembersForTeamsInTransaction", async () =>
      employeeIds.map((employeeId) => ({
        workTeamId: "team-1",
        employeeId,
        employee: buildEmployee(employeeId),
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
    );

    mock.method(operationEmployeeRepository, "listByOperationInTransaction", async () => []);

    mock.method(
      workTeamAssignmentBatchRepository,
      "addBatchItemInTransaction",
      async (_transaction, input) => {
        batchItemCalls.push(input);
        return {
          id: `item-${input.employeeId}`,
          batchId: input.batchId,
          employeeId: input.employeeId,
          result: input.result,
        };
      },
    );

    mock.method(
      workTeamAssignmentBatchRepository,
      "addBatchItemSourceInTransaction",
      async (_transaction, input) => {
        batchSourceCalls.push(input);
      },
    );

    mock.method(operationAssignmentCore, "assignEmployeeInTransaction", async () => {
      assignCalls += 1;
      if (assignCalls === 1) {
        return {
          outcome: "added",
          assignment: {
            id: "assignment-1",
            employeeId: "emp-1",
            operationId: "operation-1",
            companyId: "company-1",
            validFrom: "2026-07-13",
            validUntil: null,
            cancelledAt: null,
          },
        };
      }
      throw new AppError(500, "UNEXPECTED_ASSIGN_FAILURE", "Fallo inesperado");
    });

    mock.method(workTeamAssignmentBatchRepository, "markCompletedInTransaction", async () => {
      throw new Error("should not complete batch after partial failure");
    });

    mock.method(workTeamAssignmentBatchRepository, "markFailed", async (...args: unknown[]) => {
      markFailedCalls.push(args);
      return true;
    });

    await assert.rejects(
      () =>
        workTeamAssignmentService.confirm("company-1", "operation-1", "user-1", {
          previewToken: "batch-1",
        }),
      (error: unknown) => error instanceof AppError && error.code === "UNEXPECTED_ASSIGN_FAILURE",
    );

    assert.equal(rollbackCalls.length, 1);
    assert.equal(commitCalls, 0);
    assert.equal(markFailedCalls.length, 1);
    assert.deepEqual(markFailedCalls[0], ["company-1", "batch-1"]);
    assert.equal(batchItemCalls.length, 1, "only the first employee should persist before failure");
    assert.equal(batchSourceCalls.length, 1);
    assert.equal(assignCalls, 2);
  });

  it("preserves the original error when markFailed also fails", async () => {
    setupUnitTestEnv();

    useTestPool();
    patchTransaction();

    const { workTeamAssignmentBatchRepository } = await import(
      "../repositories/work-team-assignment-batch.repository"
    );
    const { operationRepository } = await import("../repositories/operation.repository");
    const { workTeamAssignmentService } = await import("./work-team-assignment.service");

    mock.method(workTeamAssignmentBatchRepository, "expireStalePreviews", async () => undefined);
    mock.method(operationRepository, "findById", async () => ({
      id: "operation-1",
      companyId: "company-1",
      status: "SCHEDULED",
      operationKind: "RECURRING",
    }));

    mock.method(workTeamAssignmentBatchRepository, "findByIdForUpdate", async () => {
      throw new AppError(500, "ORIGINAL_FAILURE", "Error original");
    });

    mock.method(workTeamAssignmentBatchRepository, "markFailed", async () => {
      throw new Error("mark failed secondary");
    });

    await assert.rejects(
      () =>
        workTeamAssignmentService.confirm("company-1", "operation-1", "user-1", {
          previewToken: "batch-1",
        }),
      (error: unknown) => error instanceof AppError && error.code === "ORIGINAL_FAILURE",
    );
  });
});
