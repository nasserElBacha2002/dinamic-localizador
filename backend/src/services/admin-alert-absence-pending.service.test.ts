import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

describe("adminAlertAbsencePendingService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("emits ABSENCE_REQUEST_PENDING with REQUEST category and dedup key", async () => {
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertAbsencePendingService } = await import(
      "./admin-alert-absence-pending.service"
    );

    let captured: Record<string, unknown> | null = null;
    mock.method(adminAlertService, "emit", async (input: Record<string, unknown>) => {
      captured = input;
      return { enqueued: 1, dedupSkipped: 0, recipientSkipped: 0 };
    });

    await adminAlertAbsencePendingService.emitForPendingWhatsappRequest({
      companyId: "company-1",
      requestId: "req-1",
      employeeId: "emp-1",
      employeeName: "Juan Pérez",
      absenceTypeName: "Vacaciones",
      startDate: "2026-09-01",
      endDate: "2026-09-07",
    });

    assert.ok(captured);
    assert.equal(captured!.type, "ABSENCE_REQUEST_PENDING");
    assert.equal(captured!.category, "REQUEST");
    assert.equal(captured!.severity, "INFO");
    assert.equal(captured!.absenceRequestId, "req-1");
    assert.equal(captured!.deduplicationKey, "absence-pending:req-1");
    const payload = captured!.payload as Record<string, string>;
    assert.equal(payload.employeeName, "Juan Pérez");
    assert.equal(payload.absenceTypeName, "Vacaciones");
    assert.doesNotMatch(JSON.stringify(payload), /reason|attachment|certificado|descripción/i);
  });
});
