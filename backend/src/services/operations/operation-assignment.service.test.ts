import assert from "node:assert/strict";
import sql from "mssql";
import { afterEach, describe, it, mock } from "node:test";
import { setTestPool } from "../../database/connection";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

const companyId = "00000000-0000-4000-8000-000000000001";
const operationId = "00000000-0000-4000-8000-000000000002";
const employeeId = "00000000-0000-4000-8000-000000000003";
const replacedAssignmentId = "00000000-0000-4000-8000-000000000004";
const afternoonShiftId = "00000000-0000-4000-8000-0000000000bb";

describe("operationAssignmentService", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    mock.restoreAll();
    setTestPool(null);
    for (const restore of restores.splice(0)) {
      restore();
    }
  });

  it("rejects ONE_TIME assignment outside operation work date", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../../repositories/operations/operation.repository");
    const { employeeRepository } = await import("../../repositories/employees/employee.repository");
    const { operationWorkDateService } = await import("./operation-work-date.service");
    const { operationAssignmentService } = await import("./operation-assignment.service");
    const { AppError } = await import("../../errors/app-error");

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

  it("coverage requires employee workday before cover service (shift inherited from replaced assignment)", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../../repositories/operations/operation.repository");
    const { employeeRepository } = await import("../../repositories/employees/employee.repository");
    const { operationAssignmentService } = await import("./operation-assignment.service");
    const { employeeWorkdayCoverageService } = await import(
      "../absence/employee-workday-coverage.service"
    );
    const { AppError } = await import("../../errors/app-error");

    mock.method(operationRepository, "findById", async () => ({
      id: operationId,
      status: "SCHEDULED",
      operationKind: "ONE_TIME",
      scheduleMode: "MULTI_SHIFT",
    }));
    mock.method(employeeRepository, "findById", async () => ({
      id: employeeId,
      active: true,
    }));
    const coverSpy = mock.method(employeeWorkdayCoverageService, "coverEmployeeWorkday", async () => {
      throw new Error("coverEmployeeWorkday should not run without workday context");
    });

    await assert.rejects(
      () =>
        operationAssignmentService.assignEmployee(companyId, operationId, employeeId, {
          asCoverage: true,
          replacedAssignmentId,
          operationShiftId: afternoonShiftId,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "EMPLOYEE_WORKDAY_REQUIRED");
        return true;
      },
    );

    assert.equal(coverSpy.mock.callCount(), 0);
  });
});
