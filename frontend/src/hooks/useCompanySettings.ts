import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanySettings, updateCompanySettings } from "../api/company-settings.api";
import type { UpdateCompanySettingsInput } from "../types/company-settings";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useCompanySettings(extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["company-settings", companyId],
    queryFn: () => getCompanySettings(),
    enabled,
    retry: 1,
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: UpdateCompanySettingsInput) => updateCompanySettings(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-settings", companyId] });
    },
  });
}
