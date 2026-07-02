import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InventoryWithStore } from "../../types/inventory";
import { UNASSIGNED_LABEL } from "../../utils/display-safe";
import { getInventoryStoreAddress, getInventoryStoreName } from "./inventories-list-columns";

const baseInventory = {
  id: "inv-1",
  storeId: "store-1",
  scheduledStart: "2026-06-23T14:00:00.000Z",
  scheduledEnd: "2026-06-23T22:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 15,
  status: "SCHEDULED",
  notes: null,
  createdAt: "2026-06-23T10:00:00.000Z",
  updatedAt: "2026-06-23T10:00:00.000Z",
} as InventoryWithStore;

describe("inventories list column helpers", () => {
  it("renders store name when present", () => {
    const row = {
      ...baseInventory,
      store: {
        id: "store-1",
        name: "Centro",
        address: "Av. Siempre Viva 742",
        active: true,
      },
    };

    assert.equal(getInventoryStoreName(row), "Centro");
    assert.equal(getInventoryStoreAddress(row), "Av. Siempre Viva 742");
  });

  it("renders fallback when store is missing", () => {
    const row = {
      ...baseInventory,
      store: undefined,
    } as unknown as InventoryWithStore;

    assert.equal(getInventoryStoreName(row), UNASSIGNED_LABEL);
    assert.equal(getInventoryStoreAddress(row), "—");
  });
});
