import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { Operation } from "../types/domain";
import type { EmployeeWorkday, OperationWorkday } from "../types/workday";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const companyId = "00000000-0000-4000-8000-000000000001";
const operationId = "00000000-0000-4000-8000-000000000002";
const employeeId = "00000000-0000-4000-8000-000000000003";
const operationWorkdayId = "00000000-0000-4000-8000-000000000004";
const employeeWorkdayId = "00000000-0000-4000-8000-000000000005";

const operation = (): Operation => ({
  id: operationId,
  serviceId: "00000000-0000-4000-8000-000000000010",
  operationKind: "ONE_TIME",
  scheduledStart: "2026-07-07T01:00:00.000Z",
  scheduledEnd: "2026-07-07T09:00:00.000Z",
  earlyToleranceMinutes: 30,
  lateToleranceMinutes: 45,
  status: "SCHEDULED",
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const operationWorkday = (): OperationWorkday => ({
  id: operationWorkdayId,
  companyId,
  operationId,
  workDate: "2026-07-06",
  expectedStartAt: "2026-07-06T12:00:00.000Z",
  expectedEndAt: "2026-07-06T21:00:00.000Z",
  earlyToleranceMinutes: 30,
  lateToleranceMinutes: 45,
  scheduleVersion: 1,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const employeeWorkday = (): EmployeeWorkday => ({
  id: employeeWorkdayId,
  companyId,
  operationWorkdayId,
  operationAssignmentId: "00000000-0000-4000-8000-000000000006",
  employeeId,
  expectationStatus: "EXPECTED",
  absenceRequestId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("workdayMaterializationService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("creates ONE_TIME operation workday when missing", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../repositories/operation.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { operationWorkdayRepository } = await import("../repositories/operation-workday.repository");
    const { workdayMaterializationService } = await import("./workday-materialization.service");

    mock.method(operationRepository, "findById", async () => operation());
    mock.method(companySettingsRepository, "findByCompanyId", async () => null);
    mock.method(operationWorkdayRepository, "listByOperationId", async () => []);
    mock.method(operationWorkdayRepository, "findByOperationAndWorkDate", async () => null);
    mock.method(operationWorkdayRepository, "insert", async () => operationWorkday());

    const result = await workdayMaterializationService.ensureOperationWorkday(companyId, operationId);
    assert.equal(result.id, operationWorkdayId);
    assert.equal(result.workDate, "2026-07-06");
  });

  it("returns persisted ONE_TIME workday even when current schedule resolves a different date", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../repositories/operation.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { operationWorkdayRepository } = await import("../repositories/operation-workday.repository");
    const { workdayMaterializationService } = await import("./workday-materialization.service");

    mock.method(operationRepository, "findById", async () => operation());
    mock.method(companySettingsRepository, "findByCompanyId", async () => null);
    mock.method(operationWorkdayRepository, "listByOperationId", async () => [operationWorkday()]);

    let insertCalls = 0;
    mock.method(operationWorkdayRepository, "insert", async () => {
      insertCalls += 1;
      return operationWorkday();
    });

    const result = await workdayMaterializationService.ensureOperationWorkday(companyId, operationId);
    assert.equal(result.workDate, "2026-07-06");
    assert.equal(insertCalls, 0);
  });

  it("throws when ONE_TIME operation has multiple persisted workdays", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../repositories/operation.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { operationWorkdayRepository } = await import("../repositories/operation-workday.repository");
    const { workdayMaterializationService } = await import("./workday-materialization.service");

    mock.method(operationRepository, "findById", async () => operation());
    mock.method(companySettingsRepository, "findByCompanyId", async () => null);
    mock.method(operationWorkdayRepository, "listByOperationId", async () => [
      operationWorkday(),
      { ...operationWorkday(), id: "other-workday", workDate: "2026-07-07" },
    ]);

    await assert.rejects(
      () => workdayMaterializationService.ensureOperationWorkday(companyId, operationId),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("múltiples jornadas materializadas"),
    );
  });

  it("creates expected employee workday for each employee", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../repositories/operation.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { operationWorkdayRepository } = await import("../repositories/operation-workday.repository");
    const { employeeWorkdayRepository } = await import("../repositories/employee-workday.repository");
    const { operationEmployeeRepository } = await import("../repositories/operation-employee.repository");
    const { workdayMaterializationService } = await import("./workday-materialization.service");

    mock.method(operationRepository, "findById", async () => operation());
    mock.method(companySettingsRepository, "findByCompanyId", async () => null);
    mock.method(operationWorkdayRepository, "listByOperationId", async () => [operationWorkday()]);
    mock.method(operationEmployeeRepository, "findActiveForEmployeeOnWorkDate", async () => ({
      id: "00000000-0000-4000-8000-000000000006",
      companyId,
      operationId,
      employeeId,
      validFrom: "2026-07-06",
      validUntil: "2026-07-06",
      assignedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    mock.method(employeeWorkdayRepository, "findByWorkdayAndEmployee", async () => null);
    mock.method(employeeWorkdayRepository, "insert", async () => employeeWorkday());

    const result = await workdayMaterializationService.ensureEmployeeWorkday(
      companyId,
      operationId,
      employeeId,
    );
    assert.equal(result.id, employeeWorkdayId);
    assert.equal(result.expectationStatus, "EXPECTED");
    assert.equal(result.operationAssignmentId, "00000000-0000-4000-8000-000000000006");
  });

  it("rejects employee workday when no active assignment covers work date", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../repositories/operation.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { operationWorkdayRepository } = await import("../repositories/operation-workday.repository");
    const { operationEmployeeRepository } = await import("../repositories/operation-employee.repository");
    const { workdayMaterializationService } = await import("./workday-materialization.service");
    const { AppError } = await import("../errors/app-error");

    mock.method(operationRepository, "findById", async () => operation());
    mock.method(companySettingsRepository, "findByCompanyId", async () => null);
    mock.method(operationWorkdayRepository, "listByOperationId", async () => [operationWorkday()]);
    mock.method(operationEmployeeRepository, "findActiveForEmployeeOnWorkDate", async () => null);

    await assert.rejects(
      () => workdayMaterializationService.ensureEmployeeWorkday(companyId, operationId, employeeId),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "EMPLOYEE_NOT_ASSIGNED_TO_OPERATION");
        return true;
      },
    );
  });
});
