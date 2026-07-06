import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const companyId = "00000000-0000-4000-8000-000000000001";
const operationId = "00000000-0000-4000-8000-000000000002";
const employeeId = "00000000-0000-4000-8000-000000000003";

describe("operationAssignmentService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("rejects ONE_TIME assignment outside operation work date", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { operationWorkDateService } = await import("./operation-work-date.service");
    const { operationAssignmentService } = await import("./operation-assignment.service");
    const { AppError } = await import("../errors/app-error");

    mock.method(operationRepository, "findById", async () => ({
      id: operationId,
      status: "SCHEDULED",
      operationKind: "ONE_TIME",
    }));
    mock.method(employeeRepository, "findById", async () => ({
      id: employeeId,
      active: true,
    }));
    mock.method(operationWorkDateService, "resolveOperationWorkDate", async () => "2026-07-10");

    await assert.rejects(
      () =>
        operationAssignmentService.assignEmployee(companyId, operationId, employeeId, {
          validFrom: "2026-07-15",
          validUntil: null,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "ASSIGNMENT_OUTSIDE_OPERATION_WORK_DATE");
        return true;
      },
    );
  });
});
