import { useMutation, useQueryClient } from "@tanstack/react-query";
import { executeImport, previewImport } from "../api/imports.api";
import type {
  ImportEntityType,
  ImportExecutePayload,
  ImportExecuteResult,
  ImportFilePayload,
} from "../types/import";
import { invalidateAfterImport } from "../queryKeys/invalidation";
import { requireCompanyId } from "./require-company-id";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

/** Optional multi-company fields when the backend starts returning them. */
type ImportResultWithAffectedCompanies = ImportExecuteResult & {
  affectedCompanyIds?: string[];
};

export function useImportPreview(entityType: ImportEntityType) {
  return useMutation({
    mutationFn: (payload: ImportFilePayload) => previewImport(entityType, payload),
  });
}

export function useImportExecute(entityType: ImportEntityType) {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const mutation = useMutation({
    mutationFn: ({
      companyId,
      payload,
    }: {
      companyId: string;
      payload: ImportExecutePayload;
    }) => executeImport(entityType, payload, { scopeCompanyId: companyId }),
    onSuccess: async (result, variables) => {
      const withAffected = result as ImportResultWithAffectedCompanies;
      await invalidateAfterImport(
        queryClient,
        variables.companyId,
        entityType,
        withAffected.affectedCompanyIds,
      );
    },
  });

  return {
    ...mutation,
    mutate: (
      payload: ImportExecutePayload,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => {
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), payload }, options);
    },
    mutateAsync: (
      payload: ImportExecutePayload,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), payload }, options),
  };
}
