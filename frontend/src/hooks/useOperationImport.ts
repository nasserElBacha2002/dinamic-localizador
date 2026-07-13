import { useMutation } from "@tanstack/react-query";
import { confirmOperationImport, previewOperationImport } from "../api/operations.api";
import type { OperationImportConfirmRow, OperationImportPreviewPayload } from "../types/operation-import";

export function useOperationImportPreview() {
  return useMutation({
    mutationFn: (payload: OperationImportPreviewPayload) => previewOperationImport(payload),
  });
}

export function useOperationImportConfirm() {
  return useMutation({
    mutationFn: (rows: OperationImportConfirmRow[]) => confirmOperationImport(rows),
  });
}
