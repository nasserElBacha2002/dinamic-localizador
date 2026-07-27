import { useMutation, useQueryClient } from "@tanstack/react-query";
import { executeImport, previewImport } from "../api/imports.api";
import type {
  ImportEntityType,
  ImportExecutePayload,
  ImportFilePayload,
} from "../types/import";
import { invalidateAfterImport } from "../queryKeys/invalidation";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useImportPreview(entityType: ImportEntityType) {
  return useMutation({
    mutationFn: (payload: ImportFilePayload) => previewImport(entityType, payload),
  });
}

export function useImportExecute(entityType: ImportEntityType) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (payload: ImportExecutePayload) => executeImport(entityType, payload),
    onSuccess: () => {
      void invalidateAfterImport(queryClient, companyId, entityType);
    },
  });
}
