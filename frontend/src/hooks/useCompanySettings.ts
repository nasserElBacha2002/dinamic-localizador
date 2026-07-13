import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCompanySettings, updateCompanySettings } from "../api/company-settings.api";
import type { CompanySettings, UpdateCompanySettingsInput } from "../types/company-settings";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const companySettingsQueryKey = (companyId?: string) =>
  ["company-settings", companyId] as const;

type CompanySettingsQueryOptions = Pick<
  UseQueryOptions<CompanySettings>,
  "staleTime" | "refetchOnMount" | "gcTime"
>;

export function useCompanySettings(
  extraEnabled = true,
  queryOptions?: CompanySettingsQueryOptions,
) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: companySettingsQueryKey(companyId),
    queryFn: () => getCompanySettings(),
    enabled,
    retry: 1,
    ...queryOptions,
  });
}

export function useCompanySettingsForOperationCreate() {
  return useCompanySettings(true, {
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: UpdateCompanySettingsInput) => updateCompanySettings(input),
    onSuccess: (settings) => {
      if (companyId) {
        queryClient.setQueryData(companySettingsQueryKey(companyId), settings);
      }
      void queryClient.invalidateQueries({ queryKey: companySettingsQueryKey(companyId) });
    },
  });
}
