import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanyModules, updateCompanyModules } from "../api/company-modules.api";
import type { UpdateCompanyModulesInput } from "../types/company-module";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useCompanyModules(extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["company-modules", companyId],
    queryFn: () => getCompanyModules(),
    enabled,
    retry: 1,
  });
}

export function useUpdateCompanyModules() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: UpdateCompanyModulesInput) => updateCompanyModules(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-modules", companyId] });
    },
  });
}
