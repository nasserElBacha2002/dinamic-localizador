import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const COMPANY_ID = "company-1";
const OPERATION_ID = "op-1";
const WORKDAY_ID = "ow-1";

describe("operationWorkdayService.getDetail", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns derived effective state and absence context", async () => {
    setupUnitTestEnv();
    const { operationWorkdayService } = await import("./operation-workday.service");

    mock.method(operationRepository, "findById", async () => ({
      id: OPERATION_ID,
      companyId: COMPANY_ID,
      operationKind: "RECURRING",
    }));
    mock.method(operationWorkdayRepository, "findById", async () => ({
      id: WORKDAY_ID,
      companyId: COMPANY_ID,
      operationId: OPERATION_ID,
      workDate: "2026-08-10",
      expectedStartAt: "2026-08-10T12:00:00.000Z",
      expectedEndAt: "2026-08-10T21:00:00.000Z",
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 20,
      status: "ACTIVE",
      cancellationReason: null,
    }));
    mock.method(employeeWorkdayRepository, "countExpectedByWorkdayIds", async () => new Map([[WORKDAY_ID, 1]]));

    let employeeFindByIdCalls = 0;
    mock.method(employeeRepository, "findById", async () => {
      employeeFindByIdCalls += 1;
      return null;
    });

    mock.method(employeeWorkdayRepository, "listEmployeeSummariesByOperationWorkdayId", async () => [
      {
        employeeWorkdayId: "ew-1",
        employeeId: "emp-1",
        employeeName: "Ana Test",
        expectationStatus: "JUSTIFIED",
        cancellationReason: null,
        absenceRequestId: "absence-1",
        absenceTypeName: "Vacaciones",
        absenceStartDate: "2026-08-01",
        absenceEndDate: "2026-08-14",
        hasAttendance: false,
      },
    ]);
    mock.method(absenceRequestRepository, "listApprovedByEmployeesAndDateRange", async () => []);

    const detail = await operationWorkdayService.getDetail(COMPANY_ID, OPERATION_ID, WORKDAY_ID);

    assert.equal(detail.expectedEmployees.length, 1);
    assert.equal(detail.expectedEmployees[0]?.effectiveState, "JUSTIFIED");
    assert.equal(detail.expectedEmployees[0]?.absenceContext?.absenceTypeName, "Vacaciones");
    assert.equal(employeeFindByIdCalls, 0);
  });
});
