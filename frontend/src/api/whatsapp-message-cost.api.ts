import type { PaginatedResponse } from "../types/api";
import type {
  MessageCostCompanyBreakdownItem,
  MessageCostDetailRow,
  MessageCostMonthFilters,
  MessageCostMonthlySummary,
  MessageCostTemplateBreakdownItem,
} from "../types/whatsapp-message-cost";
import { apiClient, buildParams } from "./client";

const BASE = "platform/observability/whatsapp/message-costs";

function toParams(filters: MessageCostMonthFilters) {
  return buildParams({
    year: filters.year,
    month: filters.month,
    companyId: filters.companyId,
    messageKind: filters.messageKind,
    templateSid: filters.templateSid,
    providerStatus: filters.providerStatus,
    costQuality: filters.costQuality,
    page: filters.page,
    limit: filters.limit,
  });
}

export async function getWhatsappMessageCostSummary(
  filters: MessageCostMonthFilters,
): Promise<MessageCostMonthlySummary> {
  const { data } = await apiClient.get<MessageCostMonthlySummary>(`${BASE}/summary`, {
    params: toParams(filters),
  });
  return data;
}

export async function getWhatsappMessageCostByCompany(
  filters: MessageCostMonthFilters,
): Promise<{ year: number; month: number; items: MessageCostCompanyBreakdownItem[] }> {
  const { data } = await apiClient.get<{
    year: number;
    month: number;
    items: MessageCostCompanyBreakdownItem[];
  }>(`${BASE}/by-company`, {
    params: toParams(filters),
  });
  return data;
}

export async function getWhatsappMessageCostByTemplate(
  filters: MessageCostMonthFilters,
): Promise<{ year: number; month: number; items: MessageCostTemplateBreakdownItem[] }> {
  const { data } = await apiClient.get<{
    year: number;
    month: number;
    items: MessageCostTemplateBreakdownItem[];
  }>(`${BASE}/by-template`, {
    params: toParams(filters),
  });
  return data;
}

export async function getWhatsappMessageCostDetail(
  filters: MessageCostMonthFilters,
): Promise<PaginatedResponse<MessageCostDetailRow>> {
  const { data } = await apiClient.get<PaginatedResponse<MessageCostDetailRow>>(`${BASE}/detail`, {
    params: toParams(filters),
  });
  return data;
}

export async function exportWhatsappMessageCostCsv(filters: MessageCostMonthFilters): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`${BASE}/export.csv`, {
    params: toParams(filters),
    responseType: "blob",
  });
  return data;
}

export async function requestWhatsappMessageCostResync(body: {
  year: number;
  month: number;
  companyId?: string;
  ledgerIds?: string[];
  maxRows?: number;
}): Promise<{ updated: number }> {
  const { data } = await apiClient.post<{ updated: number }>(`${BASE}/resync`, body);
  return data;
}
