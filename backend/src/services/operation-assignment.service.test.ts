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

  it("repairs missing EmployeeWorkday when assignment already exists", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { operationEmployeeRepository } = await import("../repositories/operation-employee.repository");
    const { employeeWorkdayRepository } = await import("../repositories/employee-workday.repository");
    const { workdayMaterializationService } = await import("./workday-materialization.service");
    const { operationAssignmentService } = await import("./operation-assignment.service");

    mock.method(operationRepository, "findById", async () => ({
      id: operationId,
      status: "SCHEDULED",
      operationKind: "ONE_TIME",
    }));
    mock.method(employeeRepository, "findById", async () => ({
      id: employeeId,
      active: true,
    }));
    mock.method(operationEmployeeRepository, "findAssignment", async () => ({
      operationId,
      employeeId,
      assignedAt: "2026-01-01T00:00:00.000Z",
    }));
    mock.method(employeeWorkdayRepository, "findByOperationAndEmployee", async () => null);

    let repaired = false;
    mock.method(workdayMaterializationService, "ensureEmployeeWorkday", async () => {
      repaired = true;
      return {
        id: "employee-workday",
        companyId,
        operationWorkdayId: "operation-workday",
        employeeId,
        expectationStatus: "EXPECTED",
        absenceRequestId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
    });

    const assignment = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      employeeId,
    );
    assert.equal(assignment.operationId, operationId);
    assert.equal(repaired, true);
  });
});
