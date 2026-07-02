import type { InventoryWithStore } from "../../types/inventory";
import { getRelatedName, safeText } from "../../utils/display-safe";

export function getInventoryStoreName(row: InventoryWithStore): string {
  return getRelatedName(row.store);
}

export function getInventoryStoreAddress(row: InventoryWithStore): string {
  return safeText(row.store?.address ?? null);
}
