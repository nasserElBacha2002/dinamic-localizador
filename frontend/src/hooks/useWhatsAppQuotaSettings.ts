import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getWhatsAppQuotaSettings,
  updateWhatsAppQuotaSettings,
} from "../api/whatsapp-quota-settings.api";
import type { UpdateWhatsAppQuotaSettingsInput } from "../types/whatsapp-quota-settings";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const whatsappQuotaSettingsQueryKey = (companyId: string) =>
  ["whatsapp-quota-settings", companyId] as const;

export function useWhatsAppQuotaSettings(enabled = true) {
  const { companyId, enabled: companyEnabled } = useOperationalQueryEnabled();
  return useQuery({
    queryKey: whatsappQuotaSettingsQueryKey(companyId ?? "none"),
    queryFn: () => getWhatsAppQuotaSettings(),
    enabled: enabled && companyEnabled && Boolean(companyId),
  });
}

export function useUpdateWhatsAppQuotaSettings() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: UpdateWhatsAppQuotaSettingsInput) => updateWhatsAppQuotaSettings(input),
    onSuccess: (data) => {
      if (companyId) {
        queryClient.setQueryData(whatsappQuotaSettingsQueryKey(companyId), data);
      }
    },
  });
}
