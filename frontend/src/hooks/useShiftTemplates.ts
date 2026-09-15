import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createShiftTemplate,
  deactivateShiftTemplate,
  listShiftTemplates,
  patchShiftTemplate,
} from "../api/operation-shifts.api";
import { shiftTemplateKeys } from "../queryKeys/operation-shifts";
import type {
  CreateCompanyShiftTemplateInput,
  UpdateCompanyShiftTemplateInput,
} from "../types/operation-shift";
import { requireCompanyId } from "./require-company-id";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useShiftTemplates(
  filters: { activeOnly?: boolean } = {},
  extraEnabled = true,
) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: shiftTemplateKeys.list(companyId, filters),
    queryFn: ({ signal }) =>
      listShiftTemplates({
        ...filters,
        signal,
        scopeCompanyId: requireCompanyId(companyId),
      }),
    enabled,
    retry: 1,
  });
}

export function useCreateShiftTemplate() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: CreateCompanyShiftTemplateInput) =>
      createShiftTemplate(input, { scopeCompanyId: requireCompanyId(companyId) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shiftTemplateKeys.lists(companyId) });
    },
  });
}

export function useUpdateShiftTemplate() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({
      templateId,
      input,
    }: {
      templateId: string;
      input: UpdateCompanyShiftTemplateInput;
    }) => patchShiftTemplate(templateId, input, { scopeCompanyId: requireCompanyId(companyId) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shiftTemplateKeys.lists(companyId) });
    },
  });
}

export function useDeactivateShiftTemplate() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (templateId: string) =>
      deactivateShiftTemplate(templateId, { scopeCompanyId: requireCompanyId(companyId) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: shiftTemplateKeys.lists(companyId) });
    },
  });
}
