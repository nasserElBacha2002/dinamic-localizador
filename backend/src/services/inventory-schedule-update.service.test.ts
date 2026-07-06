import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { inventoryRepository } from "../repositories/inventory.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const COMPANY_ID = "company-1";
const INVENTORY_ID = "inventory-1";
const STORE_ID = "store-1";
const ORIGINAL_START = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const editableInventory = {
  id: INVENTORY_ID,
  storeId: STORE_ID,
  scheduledStart: ORIGINAL_START,
  scheduledEnd: null,
  earlyToleranceMinutes: 60,
  lateToleranceMinutes: 90,
  status: "SCHEDULED" as const,
  notes: "original",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("inventoryService.update schedule confirmation reset", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("does not reset confirmations when only notes change", async () => {
    setupUnitTestEnv();
    const { inventoryService } = await import("./inventory.service");
    const { auditService } = await import("./audit.service");

    let resetCalls = 0;
    mock.method(inventoryRepository, "findById", async () => editableInventory);
    mock.method(inventoryRepository, "update", async (_companyId, _id, input) => ({
      ...editableInventory,
      notes: input.notes ?? editableInventory.notes,
    }));
    mock.method(
      employeeAssignmentQueryRepository,
      "resetConfirmationsForInventoryScheduleChange",
      async () => {
        resetCalls += 1;
        return 1;
      },
    );
    mock.method(auditService, "log", async () => undefined);

    await inventoryService.update(COMPANY_ID, INVENTORY_ID, {
      notes: "updated notes",
    });

    assert.equal(resetCalls, 0);
  });
});
