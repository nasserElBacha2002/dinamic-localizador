import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

describe("adminAlertMissingCheckinService (legacy WhatsApp disabled)", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("does not enqueue WhatsApp for COMPLETED ONE_TIME ops", async () => {
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertMissingCheckinService } = await import("./admin-alert-missing-checkin.service");
    const { adminAlertContextRepository } = await import(
      "../repositories/admin-alert-context.repository"
    );
    const { attendanceThresholdAlertService } = await import(
      "./attendance-threshold-alert.service"
    );

    let emitCalls = 0;
    mock.method(adminAlertService, "emit", async () => {
      emitCalls += 1;
      return { enqueued: 1, dedupSkipped: 0, recipientSkipped: 0 };
    });
    mock.method(
      adminAlertContextRepository,
      "listMissingCheckinCandidatesForOperation",
      async () => [
        {
          employeeWorkdayId: "ew-1",
          employeeId: "emp-1",
          employeeName: "Ana",
          operationId: "op-1",
          serviceName: "Svc",
          serviceAddress: null,
          serviceLocality: null,
          scheduledStart: "2026-09-11T23:30:00.000Z",
          scheduledEnd: "2026-09-12T06:00:00.000Z",
          operationTimezone: "America/Argentina/Buenos_Aires",
        },
      ],
    );
    let dirtyCalls = 0;
    mock.method(attendanceThresholdAlertService, "markEmployeeDirty", async () => {
      dirtyCalls += 1;
    });

    await adminAlertMissingCheckinService.emitForCompletedOperation("co-1", {
      id: "op-1",
      companyId: "co-1",
      status: "COMPLETED",
      operationKind: "ONE_TIME",
    } as never);

    assert.equal(emitCalls, 0);
    assert.equal(dirtyCalls, 1);
  });
});

describe("adminDynamicAttendanceAlertService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("enqueues due obligations for the three dynamic types", async () => {
    const { adminDynamicAttendanceAlertRepository } = await import(
      "../repositories/admin-dynamic-attendance-alert.repository"
    );
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminDynamicAttendanceAlertService } = await import(
      "./admin-dynamic-attendance-alert.service"
    );

    mock.method(
      adminDynamicAttendanceAlertRepository,
      "listConfirmationMissingObligations",
      async () => [
        {
          companyId: "co-1",
          recipientId: "r-1",
          recipientPhone: "+5491111111111",
          alertType: "ATTENDANCE_CONFIRMATION_MISSING",
          category: "OPERATIONAL",
          severity: "INFO",
          employeeId: "e-1",
          operationId: "op-1",
          absenceRequestId: null,
          assignmentId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          employeeWorkdayId: null,
          deduplicationKey: "confirmation-missing:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:1",
          occurredAt: "2026-09-11T22:30:00.000Z",
          dueAt: "2026-09-11T22:30:00.000Z",
          payload: {
            employeeName: "Ana",
            serviceName: "Svc",
            scheduledStart: "2026-09-11T23:30:00.000Z",
            operationTimezone: "America/Argentina/Buenos_Aires",
          },
        },
      ],
    );
    mock.method(
      adminDynamicAttendanceAlertRepository,
      "listMissingCheckinAfterStartObligations",
      async () => [],
    );
    mock.method(
      adminDynamicAttendanceAlertRepository,
      "listMissingCheckoutAfterEndObligations",
      async () => [],
    );
    mock.method(
      adminDynamicAttendanceAlertRepository,
      "listExpiredConfirmationMissingObligations",
      async () => [],
    );
    mock.method(
      adminDynamicAttendanceAlertRepository,
      "listExpiredMissingCheckinAfterStartObligations",
      async () => [],
    );
    mock.method(
      adminDynamicAttendanceAlertRepository,
      "listExpiredMissingCheckoutAfterEndObligations",
      async () => [],
    );

    let enqueued = 0;
    mock.method(adminAlertService, "enqueueObligation", async () => {
      enqueued += 1;
      return { enqueued: 1, dedupSkipped: 0, recipientSkipped: 0 };
    });

    const result = await adminDynamicAttendanceAlertService.reconcileDue(
      new Date("2026-09-11T22:35:00.000Z"),
    );
    assert.equal(result.confirmationEnqueued, 1);
    assert.equal(result.missingCheckinEnqueued, 0);
    assert.equal(result.missingCheckoutEnqueued, 0);
    assert.equal(enqueued, 1);
  });
});
