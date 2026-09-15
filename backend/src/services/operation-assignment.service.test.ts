import assert from "node:assert/strict";
import sql from "mssql";
import { afterEach, describe, it, mock } from "node:test";
import { setTestPool } from "../database/connection";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const companyId = "00000000-0000-4000-8000-000000000001";
const operationId = "00000000-0000-4000-8000-000000000002";
const employeeId = "00000000-0000-4000-8000-000000000003";
const replacedAssignmentId = "00000000-0000-4000-8000-000000000004";
const morningShiftId = "00000000-0000-4000-8000-0000000000aa";
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

  it("coverage shift mismatch rejects before prepare (no materialization spy calls)", async () => {
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
    restores.push(() => {
      (sql as { Transaction: typeof sql.Transaction }).Transaction = OriginalTransaction;
    });

    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationWorkDateService } = await import("./operation-work-date.service");
    const { operationShiftRepository } = await import("../repositories/operation-shift.repository");
    const { recurringWorkdayMaterializationService } = await import(
      "./recurring-workday-materialization.service"
    );
    const { operationAssignmentService } = await import("./operation-assignment.service");
    const { AppError } = await import("../errors/app-error");

    mock.method(operationRepository, "findById", async () => ({
      id: operationId,
      status: "SCHEDULED",
      operationKind: "ONE_TIME",
      scheduleMode: "MULTI_SHIFT",
      scheduledStart: "2026-07-10T08:00:00.000Z",
    }));
    mock.method(employeeRepository, "findById", async () => ({
      id: employeeId,
      active: true,
    }));
    mock.method(operationWorkDateService, "resolveOperationWorkDate", async () => "2026-07-10");
    mock.method(operationEmployeeRepository, "findById", async () => ({
      id: replacedAssignmentId,
      operationId,
      employeeId: "00000000-0000-4000-8000-000000000099",
      operationShiftId: morningShiftId,
      cancelledAt: null,
    }));

    const prepareSpy = mock.method(operationShiftRepository, "findByIdForOperation", async () => {
      throw new Error("prepare should not run on coverage mismatch");
    });
    mock.method(
      recurringWorkdayMaterializationService,
      "materializeMultiShiftOperationHorizon",
      async () => {
        throw new Error("materialize should not run on coverage mismatch");
      },
    );

    await assert.rejects(
      () =>
        operationAssignmentService.assignEmployee(companyId, operationId, employeeId, {
          asCoverage: true,
          replacedAssignmentId,
          operationShiftId: afternoonShiftId,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "COVERAGE_SHIFT_MISMATCH");
        return true;
      },
    );

    assert.equal(
      prepareSpy.mock.callCount(),
      0,
      "mismatch must reject before prepareOneTimeMultiShiftAssignment",
    );
  });
});
