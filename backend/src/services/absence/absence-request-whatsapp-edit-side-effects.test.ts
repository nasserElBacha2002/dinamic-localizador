import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

describe("absence-request whatsapp edit post-commit side effects", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("bumps operational impact and ensures admin alert obligation", async () => {
    setupUnitTestEnv();
    const { absenceOperationalImpactRepository } = await import(
      "../../repositories/absence/absence-operational-impact.repository"
    );
    const { absenceRequestRepository } = await import(
      "../../repositories/absence/absence-request.repository"
    );
    const { adminAlertAbsenceUpdatedService } = await import(
      "../admin-alerts/admin-alert-absence-updated.service"
    );
    const { ensureWhatsappEditPostCommitSideEffects } = await import(
      "./absence-request-whatsapp-edit-side-effects"
    );

    let bumpCalls = 0;
    mock.method(absenceOperationalImpactRepository, "bumpOperationalImpactVersion", async () => {
      bumpCalls += 1;
    });
    mock.method(absenceRequestRepository, "findDetailById", async () => ({
      id: "req-1",
      employeeId: "emp-1",
      startDate: "2026-01-05",
      endDate: "2026-01-10",
      totalDays: 4,
      employee: { name: "Ana" },
      absenceType: { name: "Vacaciones" },
    }));
    let ensureCalls = 0;
    mock.method(adminAlertAbsenceUpdatedService, "ensureOperationalForUpdatedRequest", async () => {
      ensureCalls += 1;
    });

    await ensureWhatsappEditPostCommitSideEffects({
      companyId: "co-1",
      requestId: "req-1",
      sourceMessageSid: "SM-EDIT-1",
      conversationId: "conv-1",
      previousStartDate: "2026-01-01",
      previousEndDate: "2026-01-04",
    });

    assert.equal(bumpCalls, 1);
    assert.equal(ensureCalls, 1);
  });

  it("skips operational bump on idempotent heal-only retry", async () => {
    setupUnitTestEnv();
    const { absenceOperationalImpactRepository } = await import(
      "../../repositories/absence/absence-operational-impact.repository"
    );
    const { absenceRequestRepository } = await import(
      "../../repositories/absence/absence-request.repository"
    );
    const { adminAlertAbsenceUpdatedService } = await import(
      "../admin-alerts/admin-alert-absence-updated.service"
    );
    const { ensureWhatsappEditPostCommitSideEffects } = await import(
      "./absence-request-whatsapp-edit-side-effects"
    );

    let bumpCalls = 0;
    mock.method(absenceOperationalImpactRepository, "bumpOperationalImpactVersion", async () => {
      bumpCalls += 1;
    });
    mock.method(absenceRequestRepository, "findDetailById", async () => ({
      id: "req-1",
      employeeId: "emp-1",
      startDate: "2026-01-05",
      endDate: "2026-01-10",
      totalDays: 4,
      employee: { name: "Ana" },
      absenceType: { name: "Vacaciones" },
    }));
    mock.method(adminAlertAbsenceUpdatedService, "ensureOperationalForUpdatedRequest", async () => undefined);

    await ensureWhatsappEditPostCommitSideEffects({
      companyId: "co-1",
      requestId: "req-1",
      sourceMessageSid: "SM-EDIT-1",
      previousStartDate: "2026-01-01",
      previousEndDate: "2026-01-04",
      includeOperationalBump: false,
    });

    assert.equal(bumpCalls, 0);
  });
});
