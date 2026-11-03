import assert from "node:assert/strict";
import sql from "mssql";
import { afterEach, describe, it, mock } from "node:test";
import { setTestPool } from "../../database/connection";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";
const REQUEST_ID = "22222222-2222-2222-2222-222222222222";
const EMPLOYEE_ID = "33333333-3333-3333-3333-333333333333";

describe("absenceRequestService.updateFromWhatsapp idempotency heal", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    mock.restoreAll();
    setTestPool(null);
    for (const restore of restores.splice(0)) {
      restore();
    }
  });

  const useFakeTransaction = () => {
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
  };

  const stubAlreadyAppliedPath = async () => {
    const { absenceRequestRepository } = await import(
      "../../repositories/absence/absence-request.repository"
    );
    const { absenceOperationalImpactRepository } = await import(
      "../../repositories/absence/absence-operational-impact.repository"
    );
    const { adminAlertAbsenceUpdatedService } = await import(
      "../admin-alerts/admin-alert-absence-updated.service"
    );
    const { absenceOperationImpactService } = await import("./absence-operation-impact.service");
    const { absenceRequestService } = await import("./absence-request.service");

    mock.method(absenceOperationImpactService, "getOperationTimezone", async () => "UTC");

    mock.method(absenceRequestService, "getById", async () => ({
      id: REQUEST_ID,
      employeeId: EMPLOYEE_ID,
      status: "PENDING",
      startDate: "2026-01-05",
      endDate: "2026-01-10",
      reason: "Viaje",
      totalDays: 4,
    }));
    mock.method(absenceRequestRepository, "findByIdForUpdate", async () => ({
      id: REQUEST_ID,
      employeeId: EMPLOYEE_ID,
      status: "PENDING",
      startDate: "2026-01-05",
      endDate: "2026-01-10",
      reason: "Viaje",
      reservationVersion: 1,
    }));
    mock.method(absenceRequestRepository, "hasEventWithComment", async () => true);
    mock.method(absenceRequestRepository, "updateEditableFields", async () => {
      throw new Error("must not update on idempotent retry");
    });
    mock.method(absenceRequestRepository, "findDetailById", async () => ({
      id: REQUEST_ID,
      employeeId: EMPLOYEE_ID,
      startDate: "2026-01-05",
      endDate: "2026-01-10",
      totalDays: 4,
      employee: { name: "Ana" },
      absenceType: { name: "Vacaciones" },
    }));
    mock.method(absenceRequestRepository, "findWhatsappEditAuditContext", async () => ({
      previousStartDate: "2026-01-01",
      previousEndDate: "2026-01-04",
    }));

    let bumpCalls = 0;
    mock.method(absenceOperationalImpactRepository, "bumpOperationalImpactVersion", async () => {
      bumpCalls += 1;
    });
    let ensureCalls = 0;
    mock.method(adminAlertAbsenceUpdatedService, "ensureOperationalForUpdatedRequest", async () => {
      ensureCalls += 1;
    });

    return { bumpCalls: () => bumpCalls, ensureCalls: () => ensureCalls, absenceRequestService };
  };

  it("re-runs post-commit side effects when edit marker already exists", async () => {
    setupUnitTestEnv();
    useFakeTransaction();
    const { bumpCalls, ensureCalls, absenceRequestService } = await stubAlreadyAppliedPath();

    const result = await absenceRequestService.updateFromWhatsapp(COMPANY_ID, REQUEST_ID, {
      employeeId: EMPLOYEE_ID,
      startDate: "2026-01-05",
      endDate: "2026-01-10",
      reason: "Viaje actualizado",
      sourceMessageSid: "SM-EDIT-1",
    });

    assert.equal(result.isExisting, true);
    assert.equal(result.detail.id, REQUEST_ID);
    assert.equal(bumpCalls(), 0);
    assert.equal(ensureCalls(), 1);
  });

  it("heals again on duplicate retry with same MessageSid without duplicate bump", async () => {
    setupUnitTestEnv();
    useFakeTransaction();
    const { bumpCalls, ensureCalls, absenceRequestService } = await stubAlreadyAppliedPath();

    await absenceRequestService.updateFromWhatsapp(COMPANY_ID, REQUEST_ID, {
      employeeId: EMPLOYEE_ID,
      sourceMessageSid: "SM-EDIT-1",
    });
    await absenceRequestService.updateFromWhatsapp(COMPANY_ID, REQUEST_ID, {
      employeeId: EMPLOYEE_ID,
      sourceMessageSid: "SM-EDIT-1",
    });

    assert.equal(bumpCalls(), 0);
    assert.equal(ensureCalls(), 2);
  });
});
