import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

setupUnitTestEnv();

describe("adminAlertAbsencePendingService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("emits OPERATIONAL alert with creation dedup key and truthful status", async () => {
    const { adminAlertService } = await import("./admin-alert.service");
    const { adminAlertAbsencePendingService } = await import(
      "./admin-alert-absence-pending.service"
    );

    let captured: Record<string, unknown> | null = null;
    mock.method(adminAlertService, "emit", async (input: Record<string, unknown>) => {
      captured = input;
      return { enqueued: 1, dedupSkipped: 0, recipientSkipped: 0 };
    });

    await adminAlertAbsencePendingService.emitOperationalForCreatedRequest({
      companyId: "company-1",
      requestId: "req-1",
      employeeId: "emp-1",
      employeeName: "Juan Pérez",
      absenceTypeName: "Vacaciones",
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      totalDays: 5,
      initialStatus: "APPROVED",
    });

    assert.ok(captured);
    assert.equal(captured!.type, "ABSENCE_REQUEST_PENDING");
    assert.equal(captured!.category, "OPERATIONAL");
    assert.equal(captured!.deduplicationKey, "absence-created:operational:req-1");
    const payload = captured!.payload as Record<string, unknown>;
    assert.equal(payload.absenceTotalDays, 5);
    assert.equal(payload.absenceStatusLabel, "Aprobada");
    assert.match(String(payload.absenceDetailUrl), /\/absences\/req-1$/);
    assert.doesNotMatch(JSON.stringify(payload), /reason|attachment|certificado|descripción/i);
  });
});
