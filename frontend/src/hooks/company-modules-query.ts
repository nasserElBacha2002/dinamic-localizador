/** Company modules are stable; cache per active company to avoid refetch on every navigation. */
export const COMPANY_MODULES_STALE_TIME_MS = 10 * 60 * 1000;
export const COMPANY_MODULES_GC_TIME_MS = 30 * 60 * 1000;

export const companyModulesQueryKey = (companyId: string | undefined) =>
  ["company-modules", companyId] as const;

export function companyModulesQueryOptions(companyId: string | undefined, enabled: boolean) {
  return {
    queryKey: companyModulesQueryKey(companyId),
    staleTime: COMPANY_MODULES_STALE_TIME_MS,
    gcTime: COMPANY_MODULES_GC_TIME_MS,
    refetchOnWindowFocus: false,
    enabled: enabled && Boolean(companyId),
  } as const;
}
