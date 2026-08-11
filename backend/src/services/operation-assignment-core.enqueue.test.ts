import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import sql from "mssql";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

describe("operationAssignmentCore ONE_TIME enqueue", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("calls enqueueAssigned when outcome is added for ONE_TIME", async () => {
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationAssignmentNotificationRepository } = await import(
      "../repositories/operation-assignment-notification.repository"
    );
    const { workdayMaterializationService } = await import("./workday-materialization.service");
    const { operationAssignmentCore } = await import("./operation-assignment-core.service");

    mock.method(operationEmployeeRepository, "findOverlappingInTransaction", async () => null);
    mock.method(operationEmployeeRepository, "createInTransaction", async () => ({
      id: "assignment-1",
      companyId: "company-1",
      operationId: "operation-1",
      employeeId: "employee-1",
      validFrom: "2026-08-11",
      validUntil: "2026-08-11",
      assignedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(
      workdayMaterializationService,
      "ensureEmployeeWorkdayForAssignmentInTransaction",
      async () => undefined,
    );

    let enqueued: {
      companyId: string;
      assignmentId: string;
      operationId: string;
      employeeId: string;
    } | null = null;
    mock.method(
      operationAssignmentNotificationRepository,
      "enqueueAssigned",
      async (
        companyId: string,
        assignmentId: string,
        operationId: string,
        employeeId: string,
      ) => {
        enqueued = { companyId, assignmentId, operationId, employeeId };
        return { id: "notif-1" };
      },
    );

    const transaction = {} as sql.Transaction;
    const result = await operationAssignmentCore.assignEmployeeInTransaction(
      "company-1",
      transaction,
      {
        operationId: "operation-1",
        employeeId: "employee-1",
        validFrom: "2026-08-11",
        validUntil: "2026-08-11",
        employeeActive: true,
        operationKind: "ONE_TIME",
        operationWorkDate: "2026-08-11",
      },
    );

    assert.equal(result.outcome, "added");
    assert.ok(enqueued);
    assert.deepEqual(enqueued, {
      companyId: "company-1",
      assignmentId: "assignment-1",
      operationId: "operation-1",
      employeeId: "employee-1",
    });
  });

  it("does not enqueue for RECURRING", async () => {
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationAssignmentNotificationRepository } = await import(
      "../repositories/operation-assignment-notification.repository"
    );
    const { operationAssignmentCore } = await import("./operation-assignment-core.service");

    mock.method(operationEmployeeRepository, "findOverlappingInTransaction", async () => null);
    mock.method(operationEmployeeRepository, "createInTransaction", async () => ({
      id: "assignment-2",
      companyId: "company-1",
      operationId: "operation-2",
      employeeId: "employee-1",
      validFrom: "2026-08-11",
      validUntil: null,
      assignedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    let enqueueCalls = 0;
    mock.method(operationAssignmentNotificationRepository, "enqueueAssigned", async () => {
      enqueueCalls += 1;
      return { id: "notif-x" };
    });

    const result = await operationAssignmentCore.assignEmployeeInTransaction(
      "company-1",
      {} as sql.Transaction,
      {
        operationId: "operation-2",
        employeeId: "employee-1",
        validFrom: "2026-08-11",
        validUntil: null,
        employeeActive: true,
        operationKind: "RECURRING",
        operationWorkDate: null,
      },
    );

    assert.equal(result.outcome, "added");
    assert.equal(enqueueCalls, 0);
  });

  it("does not enqueue ONE_TIME when validFrom is after operation work date", async () => {
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationAssignmentNotificationRepository } = await import(
      "../repositories/operation-assignment-notification.repository"
    );
    const { operationAssignmentCore } = await import("./operation-assignment-core.service");

    mock.method(operationEmployeeRepository, "findOverlappingInTransaction", async () => null);
    mock.method(operationEmployeeRepository, "createInTransaction", async () => ({
      id: "assignment-3",
      companyId: "company-1",
      operationId: "operation-3",
      employeeId: "employee-1",
      validFrom: "2026-08-12",
      validUntil: "2026-08-12",
      assignedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    let enqueueCalls = 0;
    mock.method(operationAssignmentNotificationRepository, "enqueueAssigned", async () => {
      enqueueCalls += 1;
      return { id: "notif-skip" };
    });

    const result = await operationAssignmentCore.assignEmployeeInTransaction(
      "company-1",
      {} as sql.Transaction,
      {
        operationId: "operation-3",
        employeeId: "employee-1",
        validFrom: "2026-08-12",
        validUntil: "2026-08-12",
        employeeActive: true,
        operationKind: "ONE_TIME",
        operationWorkDate: "2026-08-11",
      },
    );

    assert.equal(result.outcome, "added");
    assert.equal(enqueueCalls, 0);
  });
});
