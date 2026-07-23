import { useMutation } from "@tanstack/react-query";
import { executeImport, previewImport } from "../api/imports.api";
import type { ImportEntityType, ImportFilePayload } from "../types/import";

export function useImportPreview(entityType: ImportEntityType) {
  return useMutation({
    mutationFn: (payload: ImportFilePayload) => previewImport(entityType, payload),
  });
}

export function useImportExecute(entityType: ImportEntityType) {
  return useMutation({
    mutationFn: (payload: ImportFilePayload) => executeImport(entityType, payload),
  });
}
