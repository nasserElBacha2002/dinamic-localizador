import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { EmployeeAssignedInventory } from "../types/employee-assignment-query";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { runWithBotRuntimeContext } from "../utils/bot-runtime-context";
import {
  NO_TODAY_ASSIGNMENTS_MESSAGE,
  NO_UPCOMING_ASSIGNMENTS_MESSAGE,
} from "../utils/employee-assignment-format";

const companyId = "00000000-0000-4000-8000-000000000001";
const employeeId = "00000000-0000-4000-8000-000000000002";
const inventoryId = "00000000-0000-4000-8000-000000000003";

const assignment = (
  overrides: Partial<EmployeeAssignedInventory> = {},
): EmployeeAssignedInventory => ({
  inventoryId,
  storeName: "Carrefour Palermo",
  storeAddress: "Av. Santa Fe 1234",
  storeLatitude: -34.6,
  storeLongitude: -58.4,
  scheduledStart: "2026-07-08T23:30:00.000Z",
  scheduledEnd: "2026-07-09T06:00:00.000Z",
  inventoryStatus: "SCHEDULED",
  confirmationStatus: "PENDING",
  attendanceReceivedAt: null,
  attendanceCheckoutAt: null,
  punctualityStatus: null,
  ...overrides,
});

const runWithNow = async <T>(now: string, operation: () => Promise<T>): Promise<T> =>
  runWithBotRuntimeContext(
    {
      simulationSessionId: "sim-workday",
      employeeIdOverride: employeeId,
      phoneNumber: "+5491111111111",
      simulatedNow: new Date(now),
      mode: "dry-run",
      skipWhatsAppPersistence: true,
      messages: [],
      technicalDetails: {},
      simulationArtifacts: [],
      virtualAttendanceRecords: [],
      lastBotResponse: null,
      lastDetectedIntent: null,
      lastTwilioPayload: null,
    },
    operation,
  );

describe("employeeWorkdayService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns no-assignment message when today has no inventories", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    mock.method(employeeAssignmentQueryRepository, "listTodayForEmployee", async () => []);

    const message = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.buildTodayWorkdayMessage(companyId, employeeId, true),
    );

    assert.equal(message, NO_TODAY_ASSIGNMENTS_MESSAGE);
  });

  it("returns numbered today assignments with attendance state", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    mock.method(employeeAssignmentQueryRepository, "listTodayForEmployee", async () => [
      assignment(),
      assignment({
        inventoryId: "00000000-0000-4000-8000-000000000004",
        storeName: "Jumbo Caballito",
      }),
    ]);

    const message = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.buildTodayWorkdayMessage(companyId, employeeId, true),
    );

    assert.match(message, /Tu jornada de hoy:/);
    assert.match(message, /1\. Carrefour Palermo/);
    assert.match(message, /2\. Jumbo Caballito/);
    assert.match(message, /Llegada: pendiente/);
  });

  it("returns upcoming assignments ordered and limited by repository", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    mock.method(employeeAssignmentQueryRepository, "listUpcomingForEmployee", async () => [
      assignment(),
    ]);

    const message = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.buildUpcomingAssignmentsMessage(companyId, employeeId),
    );

    assert.match(message, /Tus próximos inventarios:/);
    assert.match(message, /Carrefour Palermo/);
  });

  it("returns no upcoming message when repository is empty", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    mock.method(employeeAssignmentQueryRepository, "listUpcomingForEmployee", async () => []);

    const message = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.buildUpcomingAssignmentsMessage(companyId, employeeId),
    );

    assert.equal(message, NO_UPCOMING_ASSIGNMENTS_MESSAGE);
  });

  it("confirms assignment idempotently when already confirmed", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let updateCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByInventoryForEmployee", async () =>
      assignment({ confirmationStatus: "CONFIRMED" }),
    );
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      updateCalls += 1;
      return true;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, inventoryId),
    );

    assert.equal(result.kind, "ok");
    assert.match(result.message, /confirmamos tu asistencia/i);
    assert.equal(updateCalls, 0);
  });

  it("marks assignment unavailable idempotently when already unavailable", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let updateCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByInventoryForEmployee", async () =>
      assignment({ confirmationStatus: "UNAVAILABLE" }),
    );
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      updateCalls += 1;
      return true;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(companyId, employeeId, inventoryId),
    );

    assert.equal(result.kind, "ok");
    assert.match(result.message, /no estás disponible/i);
    assert.equal(updateCalls, 0);
  });

  it("does not confirm past assignments", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    mock.method(employeeAssignmentQueryRepository, "findByInventoryForEmployee", async () =>
      assignment({ scheduledStart: "2026-07-08T10:00:00.000Z" }),
    );

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, inventoryId),
    );

    assert.equal(result.kind, "past");
  });

  it("scopes today workday query to company and employee", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let queriedCompanyId: string | null = null;
    let queriedEmployeeId: string | null = null;

    mock.method(
      employeeAssignmentQueryRepository,
      "listTodayForEmployee",
      async (resolvedCompanyId: string, resolvedEmployeeId: string) => {
        queriedCompanyId = resolvedCompanyId;
        queriedEmployeeId = resolvedEmployeeId;
        return [];
      },
    );

    await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.buildTodayWorkdayMessage(companyId, employeeId, true),
    );

    assert.equal(queriedCompanyId, companyId);
    assert.equal(queriedEmployeeId, employeeId);
  });

  it("scopes upcoming assignments query to company and employee", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let queriedCompanyId: string | null = null;
    let queriedEmployeeId: string | null = null;

    mock.method(
      employeeAssignmentQueryRepository,
      "listUpcomingForEmployee",
      async (resolvedCompanyId: string, resolvedEmployeeId: string) => {
        queriedCompanyId = resolvedCompanyId;
        queriedEmployeeId = resolvedEmployeeId;
        return [];
      },
    );

    await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.buildUpcomingAssignmentsMessage(companyId, employeeId),
    );

    assert.equal(queriedCompanyId, companyId);
    assert.equal(queriedEmployeeId, employeeId);
  });

  it("cannot confirm assignment outside resolved company or employee scope", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");
    const { INVALID_SELECTION_MESSAGE } = await import("./bot/bot-response.builder");

    let updateCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByInventoryForEmployee", async () => null);
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      updateCalls += 1;
      return true;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, inventoryId),
    );

    assert.equal(result.kind, "not_found");
    assert.equal(result.message, INVALID_SELECTION_MESSAGE);
    assert.equal(updateCalls, 0);
  });

  it("cannot mark unavailable outside resolved company or employee scope", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");
    const { INVALID_SELECTION_MESSAGE } = await import("./bot/bot-response.builder");

    let updateCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByInventoryForEmployee", async () => null);
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      updateCalls += 1;
      return true;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(companyId, employeeId, inventoryId),
    );

    assert.equal(result.kind, "not_found");
    assert.equal(result.message, INVALID_SELECTION_MESSAGE);
    assert.equal(updateCalls, 0);
  });

  it("updates confirmation status when confirming after unavailable", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let updatedStatus: string | null = null;
    mock.method(employeeAssignmentQueryRepository, "findByInventoryForEmployee", async () =>
      assignment({ confirmationStatus: "UNAVAILABLE" }),
    );
    mock.method(
      employeeAssignmentQueryRepository,
      "updateConfirmationStatus",
      async (_companyId, _employeeId, _inventoryId, status) => {
        updatedStatus = status;
        return true;
      },
    );

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, inventoryId),
    );

    assert.equal(result.kind, "ok");
    assert.equal(updatedStatus, "CONFIRMED");
  });

  it("updates confirmation status when marking unavailable after confirmed", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let updatedStatus: string | null = null;
    mock.method(employeeAssignmentQueryRepository, "findByInventoryForEmployee", async () =>
      assignment({ confirmationStatus: "CONFIRMED" }),
    );
    mock.method(
      employeeAssignmentQueryRepository,
      "updateConfirmationStatus",
      async (_companyId, _employeeId, _inventoryId, status) => {
        updatedStatus = status;
        return true;
      },
    );

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(companyId, employeeId, inventoryId),
    );

    assert.equal(result.kind, "ok");
    assert.equal(updatedStatus, "UNAVAILABLE");
    assert.match(result.message, /podrá revisar esta respuesta desde el panel/i);
  });
});
