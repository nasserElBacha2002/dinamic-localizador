import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { EmployeeAssignedOperation } from "../types/employee-assignment-query";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { mockAdminAlertSideEffects } from "../test-helpers/mock-admin-alert-side-effects";
import { runWithBotRuntimeContext } from "../utils/bot-runtime-context";
import {
  NO_TODAY_ASSIGNMENTS_MESSAGE,
  NO_UPCOMING_ASSIGNMENTS_MESSAGE,
} from "../utils/employee-assignment-format";

const companyId = "00000000-0000-4000-8000-000000000001";
const employeeId = "00000000-0000-4000-8000-000000000002";
const operationId = "00000000-0000-4000-8000-000000000003";

const assignment = (
  overrides: Partial<EmployeeAssignedOperation> = {},
): EmployeeAssignedOperation => ({
  assignmentId: "assignment-1",
  operationId,
  operationKind: "ONE_TIME",
  operationWorkdayId: "ow-1",
  employeeWorkdayId: null,
  serviceName: "Carrefour Palermo",
  serviceAddress: "Av. Santa Fe 1234",
  serviceLocality: "Palermo",
  serviceLatitude: -34.6,
  serviceLongitude: -58.4,
  scheduledStart: "2026-07-08T23:30:00.000Z",
  scheduledEnd: "2026-07-09T06:00:00.000Z",
  operationStatus: "SCHEDULED",
  confirmationStatus: "PENDING",
  attendanceReceivedAt: null,
  attendanceCheckoutAt: null,
  punctualityStatus: null,
  ...overrides,
});

const mockEmptyUnavailabilityList = async () => {
  const { employeeAssignmentQueryRepository } = await import(
    "../repositories/employee-assignment-query.repository"
  );
  mock.method(employeeAssignmentQueryRepository, "listUnavailabilityForEmployee", async () => []);
};

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

  it("returns no-assignment message when today has no operations", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    mock.method(employeeWorkdayAvailabilityRepository, "listTodayWorkdaysForEmployee", async () => []);

    const message = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.buildTodayWorkdayMessage(companyId, employeeId, true),
    );

    assert.equal(message, NO_TODAY_ASSIGNMENTS_MESSAGE);
  });

  it("returns numbered today assignments with attendance state", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    const todayRow = {
      assignmentId: "assignment-1",
      operationId,
      serviceName: "Carrefour Palermo",
      serviceAddress: "Av. Santa Fe 1234",
      serviceLocality: "Palermo",
      serviceLatitude: -34.6,
      serviceLongitude: -58.4,
      scheduledStart: "2026-07-08T23:30:00.000Z",
      scheduledEnd: "2026-07-09T06:00:00.000Z",
      operationStatus: "SCHEDULED",
      confirmationStatus: "PENDING",
      attendanceReceivedAt: null,
      attendanceCheckoutAt: null,
      punctualityStatus: null,
      employeeWorkdayId: "ew-1",
      operationWorkdayId: "ow-1",
      expectationStatus: "EXPECTED",
    };

    mock.method(employeeWorkdayAvailabilityRepository, "listTodayWorkdaysForEmployee", async () => [
      todayRow,
      {
        ...todayRow,
        assignmentId: "assignment-2",
        operationId: "00000000-0000-4000-8000-000000000004",
        serviceName: "Jumbo Caballito",
        employeeWorkdayId: "ew-2",
        operationWorkdayId: "ow-2",
      },
    ]);

    const message = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.buildTodayWorkdayMessage(companyId, employeeId, true),
    );

    assert.match(message, /Tu jornada de hoy:/);
    assert.match(message, /1\. Carrefour Palermo/);
    assert.match(message, /2\. Jumbo Caballito/);
    assert.match(message, /Llegada: pendiente/);
  });

  it("includes canonical service reference in upcoming assignments message", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    mock.method(employeeAssignmentQueryRepository, "listUpcomingForEmployee", async () => [
      assignment({
        serviceName: "Carrefour Caballito",
        serviceAddress: "Av. Rivadavia 5108",
        serviceLocality: "Caballito",
      }),
    ]);

    const message = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.buildUpcomingAssignmentsMessage(companyId, employeeId),
    );

    assert.match(
      message,
      /Carrefour Caballito - Av\. Rivadavia 5108 - Caballito/,
    );
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

    assert.match(message, /Tus próximos trabajos:/);
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
    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () =>
      assignment({ confirmationStatus: "CONFIRMED" }),
    );
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      updateCalls += 1;
      return true;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "ok");
    assert.match(result.message, /confirmamos tu asistencia/i);
    assert.equal(updateCalls, 0);
  });

  it("marks assignment unavailable idempotently when already unavailable", async () => {
    setupUnitTestEnv();
    await mockEmptyUnavailabilityList();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let updateCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () =>
      assignment({ confirmationStatus: "UNAVAILABLE" }),
    );
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      updateCalls += 1;
      return true;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "ok");
    assert.match(result.message, /no estás disponible/i);
    assert.equal(updateCalls, 0);
  });

  it("allows unavailability for a habitual assignment on today's started workday", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayRepository } = await import("../repositories/employee-workday.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { replacementRequestService } = await import("./replacement-request.service");
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let assignmentUpdates = 0;
    let markedWorkdayId: string | null = null;
    const todayOccurrence = assignment({
      employeeWorkdayId: "workday-today",
      operationKind: "RECURRING",
      scheduledStart: "2026-07-08T10:00:00.000Z",
      scheduledEnd: "2026-07-08T18:00:00.000Z",
    });

    mock.method(employeeAssignmentQueryRepository, "listUnavailabilityForEmployee", async () => [
      todayOccurrence,
    ]);
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      assignmentUpdates += 1;
      return true;
    });
    mock.method(employeeWorkdayRepository, "markUnavailable", async (_companyId, workdayId) => {
      markedWorkdayId = workdayId;
      return true;
    });
    mock.method(employeeRepository, "findById", async () => null);
    mock.method(replacementRequestService, "createForUnavailable", async () => undefined);

    const listed = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.listUnavailabilityAssignments(companyId, employeeId),
    );
    assert.equal(listed.length, 1);

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(
        companyId,
        employeeId,
        operationId,
        "workday-today",
      ),
    );

    assert.equal(result.kind, "ok");
    assert.equal(markedWorkdayId, "workday-today");
    assert.equal(assignmentUpdates, 0);
  });

  it("keeps ONE_TIME future unavailability allowed and ONE_TIME started rejected", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");
    const { PAST_ASSIGNMENT_MESSAGE } = await import("../utils/employee-assignment-format");

    const futureOneTime = assignment({
      operationKind: "ONE_TIME",
      employeeWorkdayId: "ew-one-future",
      scheduledStart: "2026-07-08T23:30:00.000Z",
      scheduledEnd: "2026-07-09T06:00:00.000Z",
    });
    const startedOneTime = assignment({
      operationKind: "ONE_TIME",
      employeeWorkdayId: "ew-one-started",
      scheduledStart: "2026-07-08T10:00:00.000Z",
      scheduledEnd: "2026-07-08T18:00:00.000Z",
    });

    mock.method(employeeAssignmentQueryRepository, "listUnavailabilityForEmployee", async () => [
      futureOneTime,
    ]);
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => true);

    const { employeeWorkdayRepository } = await import("../repositories/employee-workday.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { replacementRequestService } = await import("./replacement-request.service");
    mock.method(employeeWorkdayRepository, "markUnavailable", async () => true);
    mock.method(employeeRepository, "findById", async () => null);
    mock.method(replacementRequestService, "createForUnavailable", async () => undefined);

    const futureResult = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(
        companyId,
        employeeId,
        operationId,
        "ew-one-future",
      ),
    );
    assert.equal(futureResult.kind, "ok");

    mock.method(employeeAssignmentQueryRepository, "listUnavailabilityForEmployee", async () => [
      startedOneTime,
    ]);
    const startedResult = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(
        companyId,
        employeeId,
        operationId,
        "ew-one-started",
      ),
    );
    assert.equal(startedResult.kind, "past");
    assert.equal(startedResult.message, PAST_ASSIGNMENT_MESSAGE);
  });

  it("emits distinct unavailable-workday dedup keys for distinct recurring occurrences", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayRepository } = await import("../repositories/employee-workday.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { replacementRequestService } = await import("./replacement-request.service");
    const { adminAlertService } = await import("./admin-alert.service");
    const { attendanceThresholdAlertService } = await import("./attendance-threshold-alert.service");
    const { employeeWorkdayService } = await import("./employee-workday.service");
    const { buildUnavailableWorkdayDedupKey } = await import("../utils/admin-alert/dedup-keys");

    const dedupKeys: string[] = [];
    mock.method(adminAlertService, "emit", async (input: { deduplicationKey: string }) => {
      dedupKeys.push(input.deduplicationKey);
      return { enqueued: 1, dedupSkipped: 0, recipientSkipped: 0 };
    });
    mock.method(attendanceThresholdAlertService, "markEmployeeDirty", async () => undefined);
    mock.method(employeeWorkdayRepository, "markUnavailable", async () => true);
    mock.method(employeeRepository, "findById", async () => ({
      id: employeeId,
      companyId,
      name: "Ana",
      phoneNumber: "+5491111111111",
      employeeType: "fijo",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(replacementRequestService, "createForUnavailable", async () => undefined);

    for (const workdayId of ["workday-A", "workday-B"] as const) {
      mock.method(employeeAssignmentQueryRepository, "listUnavailabilityForEmployee", async () => [
        assignment({
          employeeWorkdayId: workdayId,
          operationKind: "RECURRING",
          scheduledStart: "2026-07-10T10:00:00.000Z",
          scheduledEnd: "2026-07-10T18:00:00.000Z",
        }),
      ]);
      const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
        employeeWorkdayService.markAssignmentUnavailable(
          companyId,
          employeeId,
          operationId,
          workdayId,
        ),
      );
      assert.equal(result.kind, "ok");
    }

    assert.deepEqual(dedupKeys, [
      buildUnavailableWorkdayDedupKey("workday-A"),
      buildUnavailableWorkdayDedupKey("workday-B"),
    ]);
    assert.notEqual(dedupKeys[0], dedupKeys[1]);

    // Retry same occurrence: markUnavailable returns false → no second alert key.
    mock.method(employeeWorkdayRepository, "markUnavailable", async () => false);
    mock.method(employeeAssignmentQueryRepository, "listUnavailabilityForEmployee", async () => [
      assignment({
        employeeWorkdayId: "workday-A",
        operationKind: "RECURRING",
        scheduledStart: "2026-07-10T10:00:00.000Z",
        scheduledEnd: "2026-07-10T18:00:00.000Z",
      }),
    ]);
    const retry = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(
        companyId,
        employeeId,
        operationId,
        "workday-A",
      ),
    );
    assert.equal(retry.kind, "ok");
    assert.equal(dedupKeys.length, 2);
  });

  it("allows unavailability for a habitual assignment on a future workday", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayRepository } = await import("../repositories/employee-workday.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { replacementRequestService } = await import("./replacement-request.service");
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let assignmentUpdates = 0;
    let markedWorkdayId: string | null = null;
    const futureOccurrence = assignment({
      employeeWorkdayId: "workday-future",
      operationKind: "RECURRING",
      scheduledStart: "2026-07-10T10:00:00.000Z",
      scheduledEnd: "2026-07-10T18:00:00.000Z",
    });

    mock.method(employeeAssignmentQueryRepository, "listUnavailabilityForEmployee", async () => [
      futureOccurrence,
    ]);
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      assignmentUpdates += 1;
      return true;
    });
    mock.method(employeeWorkdayRepository, "markUnavailable", async (_companyId, workdayId) => {
      markedWorkdayId = workdayId;
      return true;
    });
    mock.method(employeeRepository, "findById", async () => null);
    mock.method(replacementRequestService, "createForUnavailable", async () => undefined);

    const listed = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.listUnavailabilityAssignments(companyId, employeeId),
    );
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.employeeWorkdayId, "workday-future");

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(
        companyId,
        employeeId,
        operationId,
        "workday-future",
      ),
    );

    assert.equal(result.kind, "ok");
    assert.equal(markedWorkdayId, "workday-future");
    assert.equal(assignmentUpdates, 0);
  });

  it("marks only the selected recurring occurrence unavailable without changing its base assignment", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayRepository } = await import("../repositories/employee-workday.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { replacementRequestService } = await import("./replacement-request.service");
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let assignmentUpdates = 0;
    let markedWorkdayId: string | null = null;
    let replacementWorkdayId: string | null = null;
    mock.method(employeeAssignmentQueryRepository, "listUnavailabilityForEmployee", async () => [
      assignment({ employeeWorkdayId: "workday-D", operationKind: "RECURRING" }),
    ]);
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      assignmentUpdates += 1;
      return true;
    });
    mock.method(employeeWorkdayRepository, "markUnavailable", async (_companyId, workdayId) => {
      markedWorkdayId = workdayId;
      return true;
    });
    mock.method(employeeRepository, "findById", async () => null);
    mock.method(replacementRequestService, "createForUnavailable", async ({ employeeWorkdayId }) => {
      replacementWorkdayId = employeeWorkdayId;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(companyId, employeeId, operationId, "workday-D"),
    );

    assert.equal(result.kind, "ok");
    assert.equal(markedWorkdayId, "workday-D");
    assert.equal(replacementWorkdayId, "workday-D");
    assert.equal(assignmentUpdates, 0);
  });

  it("rejects unavailability when there is truly no reportable assignment", async () => {
    setupUnitTestEnv();
    await mockEmptyUnavailabilityList();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");
    const { INVALID_SELECTION_MESSAGE } = await import("./bot/bot-response.builder");

    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () => null);

    const listed = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.listUnavailabilityAssignments(companyId, employeeId),
    );
    assert.equal(listed.length, 0);

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "not_found");
    assert.equal(result.message, INVALID_SELECTION_MESSAGE);
  });

  it("does not confirm past assignments", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () =>
      assignment({ scheduledStart: "2026-07-08T10:00:00.000Z" }),
    );

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "past");
  });

  it("scopes today workday query to company and employee", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let queriedCompanyId: string | null = null;
    let queriedEmployeeId: string | null = null;

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listTodayWorkdaysForEmployee",
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
    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () => null);
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      updateCalls += 1;
      return true;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "not_found");
    assert.equal(result.message, INVALID_SELECTION_MESSAGE);
    assert.equal(updateCalls, 0);
  });

  it("cannot mark unavailable outside resolved company or employee scope", async () => {
    setupUnitTestEnv();
    await mockEmptyUnavailabilityList();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");
    const { INVALID_SELECTION_MESSAGE } = await import("./bot/bot-response.builder");

    let updateCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () => null);
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      updateCalls += 1;
      return true;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "not_found");
    assert.equal(result.message, INVALID_SELECTION_MESSAGE);
    assert.equal(updateCalls, 0);
  });

  it("keeps UNAVAILABLE final when confirm reply arrives (no flip)", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let updateCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () =>
      assignment({ confirmationStatus: "UNAVAILABLE" }),
    );
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      updateCalls += 1;
      return true;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "ok");
    assert.match(result.message, /no estás disponible/i);
    assert.equal(updateCalls, 0);
  });

  it("keeps CONFIRMED final when unavailable reply arrives (no flip)", async () => {
    setupUnitTestEnv();
    await mockEmptyUnavailabilityList();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let updateCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () =>
      assignment({ confirmationStatus: "CONFIRMED" }),
    );
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => {
      updateCalls += 1;
      return true;
    });

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "ok");
    assert.match(result.message, /confirmamos tu asistencia/i);
    assert.equal(updateCalls, 0);
  });

  it("CAS confirm transitions only from PENDING", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () =>
      assignment({ confirmationStatus: "PENDING" }),
    );
    mock.method(
      employeeAssignmentQueryRepository,
      "updateConfirmationStatus",
      async (_companyId, assignmentId, status, onlyIfStatusIn) => {
        assert.equal(assignmentId, "assignment-1");
        assert.equal(status, "CONFIRMED");
        assert.deepEqual(onlyIfStatusIn, ["PENDING"]);
        return true;
      },
    );

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "ok");
  });

  it("CAS unavailable transitions only from PENDING", async () => {
    setupUnitTestEnv();
    await mockAdminAlertSideEffects();
    await mockEmptyUnavailabilityList();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () =>
      assignment({ confirmationStatus: "PENDING" }),
    );
    mock.method(
      employeeAssignmentQueryRepository,
      "updateConfirmationStatus",
      async (_companyId, assignmentId, status, onlyIfStatusIn) => {
        assert.equal(assignmentId, "assignment-1");
        assert.equal(status, "UNAVAILABLE");
        assert.deepEqual(onlyIfStatusIn, ["PENDING"]);
        return true;
      },
    );

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "ok");
    assert.match(result.message, /no estás disponible/i);
  });

  it("concurrent 1 vs 2: confirm CAS loss surfaces UNAVAILABLE winner", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let findCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () => {
      findCalls += 1;
      return assignment({
        confirmationStatus: findCalls === 1 ? "PENDING" : "UNAVAILABLE",
      });
    });
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => false);

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "ok");
    assert.match(result.message, /no estás disponible/i);
  });

  it("concurrent 2 vs 1: unavailable CAS loss surfaces CONFIRMED winner", async () => {
    setupUnitTestEnv();
    await mockAdminAlertSideEffects();
    await mockEmptyUnavailabilityList();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let findCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () => {
      findCalls += 1;
      return assignment({
        confirmationStatus: findCalls === 1 ? "PENDING" : "CONFIRMED",
      });
    });
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => false);

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.markAssignmentUnavailable(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "ok");
    assert.match(result.message, /confirmamos tu asistencia/i);
  });

  it("concurrent 1 vs 1: confirm CAS loss still reports CONFIRMED", async () => {
    setupUnitTestEnv();
    const { employeeAssignmentQueryRepository } = await import(
      "../repositories/employee-assignment-query.repository"
    );
    const { employeeWorkdayService } = await import("./employee-workday.service");

    let findCalls = 0;
    mock.method(employeeAssignmentQueryRepository, "findByOperationForEmployee", async () => {
      findCalls += 1;
      return assignment({
        confirmationStatus: findCalls === 1 ? "PENDING" : "CONFIRMED",
      });
    });
    mock.method(employeeAssignmentQueryRepository, "updateConfirmationStatus", async () => false);

    const result = await runWithNow("2026-07-08T12:00:00.000Z", () =>
      employeeWorkdayService.confirmAssignment(companyId, employeeId, operationId),
    );

    assert.equal(result.kind, "ok");
    assert.match(result.message, /confirmamos tu asistencia/i);
  });
});
