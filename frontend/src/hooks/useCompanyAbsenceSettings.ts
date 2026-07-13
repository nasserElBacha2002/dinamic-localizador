import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCompanyAbsenceSettings,
  updateCompanyAbsenceSettings,
} from "../api/company-absence-settings.api";
import type { UpdateCompanyAbsenceSettingsInput } from "../types/company-absence-settings";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const companyAbsenceSettingsQueryKey = (companyId?: string) =>
  ["company-absence-settings", companyId] as const;

export function useCompanyAbsenceSettings(extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: companyAbsenceSettingsQueryKey(companyId),
    queryFn: () => getCompanyAbsenceSettings(),
    enabled,
    retry: 1,
  });
}

export function useUpdateCompanyAbsenceSettings() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: UpdateCompanyAbsenceSettingsInput) => updateCompanyAbsenceSettings(input),
    onSuccess: (settings) => {
      if (companyId) {
        queryClient.setQueryData(companyAbsenceSettingsQueryKey(companyId), settings);
      }
      void queryClient.invalidateQueries({ queryKey: companyAbsenceSettingsQueryKey(companyId) });
    },
  });
}
