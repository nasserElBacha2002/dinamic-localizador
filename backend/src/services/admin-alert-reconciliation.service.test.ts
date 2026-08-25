import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

const sampleObligation = {
  companyId: "company-1",
  recipientId: "r1",
  recipientPhone: "+5491112345678",
  alertType: "ABSENCE_REQUEST_PENDING" as const,
  category: "REQUEST" as const,
  severity: "INFO" as const,
  employeeId: "emp-1",
  operationId: null,
  absenceRequestId: "req-1",
  deduplicationKey: "absence-pending:req-1",
  occurredAt: "2026-09-01T12:00:00.000Z",
  payload: {
    employeeName: "Juan Pérez",
    absenceTypeName: "Vacaciones",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    statusLabel: "Pendiente de revisión",
  },
};

describe("adminAlertReconciliationService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("materializes missing pending absence obligations", async () => {
    const { adminAlertContextRepository } = await import(
      "../repositories/admin-alert-context.repository"
    );
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    mock.method(
      adminAlertContextRepository,
      "listMissingPendingAbsenceObligations",
      async () => [sampleObligation],
    );
    mock.method(adminAlertService, "enqueueObligation", async () => ({
      enqueued: 1,
      dedupSkipped: 0,
      recipientSkipped: 0,
    }));

    const result = await adminAlertReconciliationService.reconcilePendingAbsenceRequests();
    assert.equal(result.scanned, 1);
    assert.equal(result.recovered, 1);
  });

  it("counts only newly enqueued obligations as recovered", async () => {
    const { adminAlertContextRepository } = await import(
      "../repositories/admin-alert-context.repository"
    );
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    mock.method(
      adminAlertContextRepository,
      "listMissingPendingAbsenceObligations",
      async () => [sampleObligation],
    );
    mock.method(adminAlertService, "enqueueObligation", async () => ({
      enqueued: 0,
      dedupSkipped: 1,
      recipientSkipped: 0,
    }));

    const result = await adminAlertReconciliationService.reconcilePendingAbsenceRequests();
    assert.equal(result.scanned, 1);
    assert.equal(result.recovered, 0);
  });

  it("reconcileAll aggregates all obligation kinds", async () => {
    const { adminAlertContextRepository } = await import(
      "../repositories/admin-alert-context.repository"
    );
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertReconciliationService } = await import(
      "./admin-alert-reconciliation.service"
    );

    mock.method(adminAlertContextRepository, "listMissingUnavailableObligations", async () => []);
    mock.method(
      adminAlertContextRepository,
      "listMissingMissingCheckinObligations",
      async () => [],
    );
    mock.method(
      adminAlertContextRepository,
      "listMissingPendingAbsenceObligations",
      async () => [sampleObligation],
    );
    mock.method(adminAlertService, "enqueueObligation", async () => ({
      enqueued: 1,
      dedupSkipped: 0,
      recipientSkipped: 0,
    }));

    const result = await adminAlertReconciliationService.reconcileAll();
    assert.equal(result.pendingAbsenceScanned, 1);
    assert.equal(result.pendingAbsenceRecovered, 1);
    assert.equal(result.unavailableScanned, 0);
    assert.equal(result.missingCheckinScanned, 0);
  });
});
