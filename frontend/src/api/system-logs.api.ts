import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  SystemLogContextMeta,
  SystemLogContextRow,
  SystemLogsListFilters,
  SystemLogsOptions,
  SystemRuntimeLogDetail,
  SystemRuntimeLogSummaryRow,
} from "../types/system-logs";
import { apiClient, buildParams } from "./client";

export async function getSystemLogs(
  filters: SystemLogsListFilters = {},
): Promise<PaginatedResponse<SystemRuntimeLogSummaryRow>> {
  const { data } = await apiClient.get<PaginatedResponse<SystemRuntimeLogSummaryRow>>(
    "platform/observability/system-logs",
    {
      params: buildParams(filters as Record<string, string | number | boolean | string[] | undefined>),
    },
  );
  return data;
}

export async function getSystemLogById(id: string): Promise<SystemRuntimeLogDetail> {
  const { data } = await apiClient.get<SingleResponse<SystemRuntimeLogDetail>>(
    `platform/observability/system-logs/${id}`,
  );
  return data.data;
}

export async function getSystemLogContext(
  id: string,
): Promise<{ data: SystemLogContextRow[]; meta: SystemLogContextMeta }> {
  const { data } = await apiClient.get<{
    data: SystemLogContextRow[];
    meta: SystemLogContextMeta;
  }>(`platform/observability/system-logs/${id}/context`);
  return data;
}

export async function getSystemLogsOptions(): Promise<SystemLogsOptions> {
  const { data } = await apiClient.get<SingleResponse<SystemLogsOptions>>(
    "platform/observability/system-logs/options",
  );
  return data.data;
}
