import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  exportWhatsappMessageCostCsv,
  getWhatsappMessageCostByCompany,
  getWhatsappMessageCostByTemplate,
  getWhatsappMessageCostDetail,
  getWhatsappMessageCostSummary,
  requestWhatsappMessageCostResync,
} from "../api/whatsapp-message-cost.api";
import type { MessageCostMonthFilters } from "../types/whatsapp-message-cost";
import { useAuth } from "./useAuth";

const BASE_KEY = "whatsapp-message-costs";

function usePlatformEnabled(enabled = true) {
  const { user } = useAuth();
  return enabled && Boolean(user?.isPlatformAdmin);
}

export function useWhatsappMessageCostSummary(
  filters: MessageCostMonthFilters,
  enabled = true,
) {
  const canFetch = usePlatformEnabled(enabled);
  return useQuery({
    queryKey: [BASE_KEY, "summary", filters],
    queryFn: () => getWhatsappMessageCostSummary(filters),
    enabled: canFetch,
  });
}

export function useWhatsappMessageCostByCompany(
  filters: MessageCostMonthFilters,
  enabled = true,
) {
  const canFetch = usePlatformEnabled(enabled);
  return useQuery({
    queryKey: [BASE_KEY, "by-company", filters],
    queryFn: () => getWhatsappMessageCostByCompany(filters),
    enabled: canFetch,
  });
}

export function useWhatsappMessageCostByTemplate(
  filters: MessageCostMonthFilters,
  enabled = true,
) {
  const canFetch = usePlatformEnabled(enabled);
  return useQuery({
    queryKey: [BASE_KEY, "by-template", filters],
    queryFn: () => getWhatsappMessageCostByTemplate(filters),
    enabled: canFetch,
  });
}

export function useWhatsappMessageCostDetail(
  filters: MessageCostMonthFilters,
  enabled = true,
) {
  const canFetch = usePlatformEnabled(enabled);
  return useQuery({
    queryKey: [BASE_KEY, "detail", filters],
    queryFn: () => getWhatsappMessageCostDetail(filters),
    enabled: canFetch,
  });
}

export function useWhatsappMessageCostResync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: requestWhatsappMessageCostResync,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
    },
  });
}

export async function downloadWhatsappMessageCostCsv(filters: MessageCostMonthFilters) {
  const blob = await exportWhatsappMessageCostCsv(filters);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `whatsapp-message-costs-${filters.year}-${String(filters.month).padStart(2, "0")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
