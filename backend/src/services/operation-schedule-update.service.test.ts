import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { operationRepository } from "../repositories/operation.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const COMPANY_ID = "company-1";
const OPERATION_ID = "operation-1";
const SERVICE_ID = "service-1";
const ORIGINAL_START = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const editableOperation = {
  id: OPERATION_ID,
  serviceId: SERVICE_ID,
  scheduledStart: ORIGINAL_START,
  scheduledEnd: null,
  earlyToleranceMinutes: 60,
  lateToleranceMinutes: 90,
  status: "SCHEDULED" as const,
  notes: "original",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("operationService.update schedule confirmation reset", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("does not reset confirmations when only notes change", async () => {
    setupUnitTestEnv();
    const { operationService } = await import("./operation.service");
    const { auditService } = await import("./audit.service");

    let resetCalls = 0;
    mock.method(operationRepository, "findById", async () => editableOperation);
    mock.method(operationRepository, "update", async (_companyId, _id, input) => ({
      ...editableOperation,
      notes: input.notes ?? editableOperation.notes,
    }));
    mock.method(
      employeeAssignmentQueryRepository,
      "resetConfirmationsForOperationScheduleChange",
      async () => {
        resetCalls += 1;
        return 1;
      },
    );
    mock.method(auditService, "log", async () => undefined);

    await operationService.update(COMPANY_ID, OPERATION_ID, {
      notes: "updated notes",
    });

    assert.equal(resetCalls, 0);
  });
});
