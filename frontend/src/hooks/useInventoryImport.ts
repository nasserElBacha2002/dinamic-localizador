import { useMutation } from "@tanstack/react-query";
import { confirmInventoryImport, previewInventoryImport } from "../api/inventories.api";
import type { InventoryImportConfirmRow, InventoryImportPreviewPayload } from "../types/inventory-import";

export function useInventoryImportPreview() {
  return useMutation({
    mutationFn: (payload: InventoryImportPreviewPayload) => previewInventoryImport(payload),
  });
}

export function useInventoryImportConfirm() {
  return useMutation({
    mutationFn: (rows: InventoryImportConfirmRow[]) => confirmInventoryImport(rows),
  });
}
