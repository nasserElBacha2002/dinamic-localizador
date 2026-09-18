import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

const companyId = "11111111-1111-1111-1111-111111111111";
const operationId = "22222222-2222-2222-2222-222222222222";
const employeeId = "33333333-3333-3333-3333-333333333333";
const actorUserId = "44444444-4444-4444-4444-444444444444";
const employeeWorkdayId = "55555555-5555-5555-5555-555555555555";
const attendanceId = "66666666-6666-6666-6666-666666666666";

function baseWorkday() {
  return {
    id: employeeWorkdayId,
    expectedStartAt: "2026-09-18T11:00:00.000Z",
    expectedEndAt: "2026-09-18T20:00:00.000Z",
    earlyToleranceMinutes: 15,
    lateToleranceMinutes: 15,
  };
}

async function withFakeTransaction<T>(run: () => Promise<T>): Promise<T> {
  const sql = await import("mssql");
  const originalTransaction = sql.default.Transaction;
  class FakeTransaction {
    async begin() {
      return undefined;
    }
    async commit() {
      return undefined;
    }
    async rollback() {
      return undefined;
    }
  }
  // @ts-expect-error test stub replaces mssql Transaction
  sql.default.Transaction = FakeTransaction;
  try {
    return await run();
  } finally {
    sql.default.Transaction = originalTransaction;
  }
}

describe("manualAttendanceService", () => {
  async function loadService() {
    const { companySettingsRepository } = await import(
      "../repositories/company-settings.repository"
    );
    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { employeeWorkdayRepository } = await import(
      "../repositories/employee-workday.repository"
    );
    const { attendanceRepository } = await import("../repositories/attendance.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { workdayMaterializationService } = await import("./workday-materialization.service");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");
    const { auditService } = await import("./audit.service");
    const { manualAttendanceService } = await import("./manual-attendance.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      allowManualAttendanceCorrections: true,
    }));
    mock.method(operationRepository, "findById", async () => ({
      id: operationId,
      status: "IN_PROGRESS",
    }));
    mock.method(employeeRepository, "findById", async () => ({
      id: employeeId,
      name: "Colaborador",
    }));
    mock.method(operationEmployeeRepository, "exists", async () => true);
    mock.method(workdayMaterializationService, "ensureOperationWorkday", async () => ({
      id: "op-wd-1",
      workDate: "2026-09-18",
      expectedStartAt: "2026-09-18T11:00:00.000Z",
      expectedEndAt: "2026-09-18T20:00:00.000Z",
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 15,
    }));
    mock.method(workdayMaterializationService, "ensureEmployeeWorkday", async () => ({
      id: employeeWorkdayId,
      operationWorkdayId: "op-wd-1",
    }));
    mock.method(employeeWorkdayRepository, "findById", async () => ({
      id: employeeWorkdayId,
      operationWorkdayId: "op-wd-1",
    }));
    const { operationWorkdayRepository } = await import(
      "../repositories/operation-workday.repository"
    );
    mock.method(operationWorkdayRepository, "findById", async () => ({
      id: "op-wd-1",
      expectedStartAt: "2026-09-18T11:00:00.000Z",
      expectedEndAt: "2026-09-18T20:00:00.000Z",
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 15,
    }));
    mock.method(botRuntimeSettingsService, "getBotRuntimeSettings", async () => ({
      earlyLeaveToleranceMinutes: 30,
    }));
    mock.method(userRepository, "findById", async () => ({ id: actorUserId, name: "Admin" }));
    mock.method(auditService, "log", async () => undefined);
    const { setTestPool } = await import("../database/connection");
    setTestPool({} as never);

    return {
      manualAttendanceService,
      attendanceRepository,
      companySettingsRepository,
      auditService,
      setTestPool,
    };
  }

  afterEach(async () => {
    mock.restoreAll();
    const { setTestPool } = await import("../database/connection");
    setTestPool(null);
  });

  it("previews check-in status from scheduled tolerances", async () => {
    const { manualAttendanceService } = await loadService();

    const preview = await manualAttendanceService.preview(companyId, {
      kind: "CHECK_IN",
      operationId,
      employeeId,
      occurredAt: "2026-09-18T11:00:00.000Z",
    });

    assert.equal(preview.uiStatus, "ON_TIME");
    assert.equal(preview.uiStatusLabel, "En punto");
  });

  it("previews late check-in", async () => {
    const { manualAttendanceService } = await loadService();
    const preview = await manualAttendanceService.preview(companyId, {
      kind: "CHECK_IN",
      operationId,
      employeeId,
      occurredAt: "2026-09-18T11:20:00.000Z",
    });
    assert.equal(preview.uiStatus, "LATE");
    assert.equal(preview.uiStatusLabel, "Tarde");
  });

  it("previews early checkout", async () => {
    const { manualAttendanceService } = await loadService();
    const preview = await manualAttendanceService.preview(companyId, {
      kind: "CHECK_OUT",
      operationId,
      employeeId,
      occurredAt: "2026-09-18T18:00:00.000Z",
    });
    assert.equal(preview.uiStatus, "EARLY_LEAVE");
    assert.equal(preview.uiStatusLabel, "Antes de hora");
  });

  it("rejects when company disables manual corrections", async () => {
    const { manualAttendanceService, companySettingsRepository } = await loadService();
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      allowManualAttendanceCorrections: false,
    }));

    await assert.rejects(
      () =>
        manualAttendanceService.preview(companyId, {
          kind: "CHECK_IN",
          operationId,
          employeeId,
          occurredAt: "2026-09-18T11:00:00.000Z",
        }),
      (error: unknown) => {
        assert.equal((error as { statusCode?: number }).statusCode, 403);
        return true;
      },
    );
  });

  it("creates manual check-in without coordinates and audits", async () => {
    const { manualAttendanceService, attendanceRepository, auditService } = await loadService();

    mock.method(attendanceRepository, "findActiveByEmployeeWorkday", async () => null);
    mock.method(attendanceRepository, "createManualCheckInInTransaction", async () => ({
      id: attendanceId,
      receivedAt: "2026-09-18T11:03:00.000Z",
      receivedLatitude: null,
      receivedLongitude: null,
      distanceMeters: null,
      arrivalSource: "MANUAL",
    }));
    mock.method(attendanceRepository, "findById", async () => ({
      id: attendanceId,
      operationId,
      employeeId,
      receivedAt: "2026-09-18T11:03:00.000Z",
      receivedLatitude: null,
      receivedLongitude: null,
      distanceMeters: null,
      locationStatus: "NOT_RECORDED",
      arrivalSource: "MANUAL",
      employee: { id: employeeId, name: "Colaborador", phoneNumber: "+54911" },
      operation: {
        id: operationId,
        status: "IN_PROGRESS",
        scheduledStart: "2026-09-18T11:00:00.000Z",
        scheduledEnd: null,
      },
      service: { id: "svc", name: "Local", address: null },
    }));
    const auditLog = mock.method(auditService, "log", async () => undefined);

    await withFakeTransaction(async () => {
      const created = await manualAttendanceService.create(companyId, actorUserId, {
        kind: "CHECK_IN",
        operationId,
        employeeId,
        occurredAt: "2026-09-18T11:03:00.000Z",
        reason: "Sin batería",
        comment: "Contingencia",
      });

      assert.equal(created.id, attendanceId);
      assert.equal(created.receivedLatitude, null);
      assert.equal(created.arrivalSource, "MANUAL");
      assert.equal(auditLog.mock.callCount(), 1);
      const auditArgs = auditLog.mock.calls[0]?.arguments[1] as {
        action: string;
        reason: string;
        newData: { arrivalSource: string; comment: string | null };
      };
      assert.equal(auditArgs.action, "MANUAL_CHECK_IN");
      assert.equal(auditArgs.reason, "Sin batería");
      assert.equal(auditArgs.newData.arrivalSource, "MANUAL");
      assert.equal(auditArgs.newData.comment, "Contingencia");
    });
  });

  it("rejects duplicate check-in create with 409", async () => {
    const { manualAttendanceService, attendanceRepository } = await loadService();
    mock.method(attendanceRepository, "findActiveByEmployeeWorkday", async () => ({
      id: attendanceId,
      receivedAt: "2026-09-18T11:00:00.000Z",
      checkoutAt: null,
    }));

    await assert.rejects(
      () =>
        manualAttendanceService.create(companyId, actorUserId, {
          kind: "CHECK_IN",
          operationId,
          employeeId,
          occurredAt: "2026-09-18T11:10:00.000Z",
          reason: "Duplicado",
        }),
      (error: unknown) => {
        assert.equal((error as { statusCode?: number; code?: string }).statusCode, 409);
        assert.equal((error as { code?: string }).code, "ARRIVAL_ALREADY_EXISTS");
        return true;
      },
    );
  });

  it("allows checkout create without prior arrival", async () => {
    const { manualAttendanceService, attendanceRepository, auditService } = await loadService();
    mock.method(attendanceRepository, "findActiveByEmployeeWorkday", async () => null);
    mock.method(attendanceRepository, "createManualExitOnlyInTransaction", async () => ({
      id: attendanceId,
      receivedAt: null,
      checkoutAt: "2026-09-18T20:05:00.000Z",
      checkoutLatitude: null,
      checkoutSource: "MANUAL",
    }));
    mock.method(attendanceRepository, "findById", async () => ({
      id: attendanceId,
      receivedAt: null,
      checkoutAt: "2026-09-18T20:05:00.000Z",
      checkoutLatitude: null,
      checkoutLongitude: null,
      checkoutDistanceMeters: null,
      checkoutSource: "MANUAL",
      employee: { id: employeeId, name: "Colaborador", phoneNumber: "+54911" },
      operation: {
        id: operationId,
        status: "IN_PROGRESS",
        scheduledStart: "2026-09-18T11:00:00.000Z",
        scheduledEnd: null,
      },
      service: { id: "svc", name: "Local", address: null },
    }));
    const auditLog = mock.method(auditService, "log", async () => undefined);

    await withFakeTransaction(async () => {
      const created = await manualAttendanceService.create(companyId, actorUserId, {
        kind: "CHECK_OUT",
        operationId,
        employeeId,
        occurredAt: "2026-09-18T20:05:00.000Z",
        reason: "Olvidó marcar llegada",
      });
      assert.equal(created.checkoutAt, "2026-09-18T20:05:00.000Z");
      assert.equal(created.checkoutLatitude, null);
      const payload = auditLog.mock.calls[0]?.arguments[1] as { action: string };
      assert.equal(payload.action, "MANUAL_CHECK_OUT");
    });
  });

  it("edits arrival and keeps previous value in audit", async () => {
    const { manualAttendanceService, attendanceRepository, auditService } = await loadService();
    mock.method(attendanceRepository, "findById", async () => ({
      id: attendanceId,
      employeeWorkdayId,
      receivedAt: "2026-09-18T11:15:00.000Z",
      punctualityStatus: "LATE",
      validationStatus: "VALID",
      arrivalSource: "WHATSAPP",
      checkoutAt: null,
      employee: { id: employeeId, name: "Colaborador", phoneNumber: "+54911" },
      operation: {
        id: operationId,
        status: "IN_PROGRESS",
        scheduledStart: "2026-09-18T11:00:00.000Z",
        scheduledEnd: null,
      },
      service: { id: "svc", name: "Local", address: null },
    }));
    mock.method(attendanceRepository, "applyManualArrivalInTransaction", async () => ({
      id: attendanceId,
      receivedAt: "2026-09-18T10:58:00.000Z",
    }));
    const auditLog = mock.method(auditService, "log", async () => undefined);

    await withFakeTransaction(async () => {
      await manualAttendanceService.edit(companyId, actorUserId, attendanceId, {
        kind: "CHECK_IN",
        occurredAt: "2026-09-18T10:58:00.000Z",
        reason: "Corrección",
      });
      const payload = auditLog.mock.calls[0]?.arguments[1] as {
        action: string;
        previousData: { receivedAt: string; punctualityStatus: string };
        newData: { receivedAt: string; arrivalSource: string };
      };
      assert.equal(payload.action, "MANUAL_CHECK_IN_EDIT");
      assert.equal(payload.previousData.receivedAt, "2026-09-18T11:15:00.000Z");
      assert.equal(payload.previousData.punctualityStatus, "LATE");
      assert.equal(payload.newData.receivedAt, "2026-09-18T10:58:00.000Z");
      assert.equal(payload.newData.arrivalSource, "MANUAL");
    });
  });
});
