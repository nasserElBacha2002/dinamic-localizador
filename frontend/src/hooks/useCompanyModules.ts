import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanyModules, updateCompanyModules } from "../api/company-modules.api";
import type { UpdateCompanyModulesInput } from "../types/company-module";
import {
  companyModulesQueryKey,
  companyModulesQueryOptions,
} from "./company-modules-query";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export { companyModulesQueryKey, companyModulesQueryOptions } from "./company-modules-query";

export function useCompanyModules(extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);
  const options = companyModulesQueryOptions(companyId, enabled);

  return useQuery({
    ...options,
    queryFn: () => getCompanyModules(),
    retry: 1,
  });
}

export function useUpdateCompanyModules() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: UpdateCompanyModulesInput) => updateCompanyModules(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: companyModulesQueryKey(companyId) });
    },
  });
}

export function useRefreshCompanyModules() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return () => queryClient.invalidateQueries({ queryKey: companyModulesQueryKey(companyId) });
}
