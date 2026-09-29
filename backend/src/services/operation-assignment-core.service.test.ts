import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import sql from "mssql";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

describe("operationAssignmentCore", () => {
  afterEach(() => mock.restoreAll());

  it("creates a ONE_TIME assignment without an assignment WhatsApp outbox side effect", async () => {
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
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

    const result = await operationAssignmentCore.assignEmployeeInTransaction(
      "company-1",
      {} as sql.Transaction,
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
  });
});
