import { useQuery } from "@tanstack/react-query";
import { getPlatformServerStatus } from "../api/platform-server-status.api";
import { useAuth } from "./useAuth";

const REFETCH_INTERVAL_MS = 30_000;
const STALE_TIME_MS = 10_000;

const viteMode = (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE;
const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
  ?.NODE_ENV;
const isTestRuntime = viteMode === "test" || nodeEnv === "test";

export function usePlatformServerStatus(enabled = true) {
  const { user, isLoading: authLoading } = useAuth();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);

  return useQuery({
    queryKey: ["platform", "servers", "status"],
    queryFn: getPlatformServerStatus,
    enabled: enabled && !authLoading && isPlatformAdmin,
    retry: isTestRuntime ? false : 1,
    retryDelay: 1_000,
    refetchInterval: isTestRuntime ? false : REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: isTestRuntime ? 0 : STALE_TIME_MS,
  });
}
