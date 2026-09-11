import { useQuery } from "@tanstack/react-query";
import { getActiveCompanyId } from "../api/company-path";
import {
  getSystemLogById,
  getSystemLogContext,
  getSystemLogs,
  getSystemLogsOptions,
} from "../api/system-logs.api";
import type { SystemLogsListFilters } from "../types/system-logs";
import { useAuth } from "./useAuth";

const BASE_KEY = "system-logs";

function usePlatformSystemLogsEnabled(enabled = true) {
  const { user } = useAuth();
  return enabled && Boolean(user?.isPlatformAdmin);
}

export function useSystemLogs(filters: SystemLogsListFilters = {}, enabled = true) {
  const canFetch = usePlatformSystemLogsEnabled(enabled);
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "list", companyId, filters],
    queryFn: () => getSystemLogs(filters),
    enabled: canFetch,
  });
}

export function useSystemLogDetail(logId: string | undefined, enabled = true) {
  const canFetch = usePlatformSystemLogsEnabled(enabled && Boolean(logId));
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "detail", companyId, logId],
    queryFn: () => getSystemLogById(logId!),
    enabled: canFetch,
  });
}

export function useSystemLogContext(logId: string | undefined, enabled = true) {
  const canFetch = usePlatformSystemLogsEnabled(enabled && Boolean(logId));
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "context", companyId, logId],
    queryFn: () => getSystemLogContext(logId!),
    enabled: canFetch,
  });
}

export function useSystemLogsOptions(enabled = true) {
  const canFetch = usePlatformSystemLogsEnabled(enabled);
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "options", companyId],
    queryFn: () => getSystemLogsOptions(),
    enabled: canFetch,
    staleTime: 5 * 60 * 1000,
  });
}
