import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  SystemLogContextMeta,
  SystemLogsListFilters,
  SystemLogsOptions,
  SystemRuntimeLogRow,
} from "../types/system-logs";
import { apiClient, buildParams } from "./client";

export async function getSystemLogs(
  filters: SystemLogsListFilters = {},
): Promise<PaginatedResponse<SystemRuntimeLogRow>> {
  const { data } = await apiClient.get<PaginatedResponse<SystemRuntimeLogRow>>(
    "platform/observability/system-logs",
    {
      params: buildParams(filters as Record<string, string | number | boolean | string[] | undefined>),
    },
  );
  return data;
}

export async function getSystemLogById(id: string): Promise<SystemRuntimeLogRow> {
  const { data } = await apiClient.get<SingleResponse<SystemRuntimeLogRow>>(
    `platform/observability/system-logs/${id}`,
  );
  return data.data;
}

export async function getSystemLogContext(
  id: string,
): Promise<{ data: SystemRuntimeLogRow[]; meta: SystemLogContextMeta }> {
  const { data } = await apiClient.get<{
    data: SystemRuntimeLogRow[];
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
