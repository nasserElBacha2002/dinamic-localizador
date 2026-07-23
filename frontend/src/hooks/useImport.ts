import { useMutation } from "@tanstack/react-query";
import { executeImport, previewImport } from "../api/imports.api";
import type {
  ImportEntityType,
  ImportExecutePayload,
  ImportFilePayload,
} from "../types/import";

export function useImportPreview(entityType: ImportEntityType) {
  return useMutation({
    mutationFn: (payload: ImportFilePayload) => previewImport(entityType, payload),
  });
}

export function useImportExecute(entityType: ImportEntityType) {
  return useMutation({
    mutationFn: (payload: ImportExecutePayload) => executeImport(entityType, payload),
  });
}
