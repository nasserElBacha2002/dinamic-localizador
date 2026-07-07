import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
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

  it("returns employee summaries from joined query without per-employee lookups", async () => {
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
        employeeId: "emp-1",
        employeeName: "Ana Test",
        expectationStatus: "EXPECTED",
      },
    ]);

    const detail = await operationWorkdayService.getDetail(COMPANY_ID, OPERATION_ID, WORKDAY_ID);

    assert.equal(detail.expectedEmployees.length, 1);
    assert.equal(detail.expectedEmployees[0]?.employeeName, "Ana Test");
    assert.equal(employeeFindByIdCalls, 0);
  });
});
