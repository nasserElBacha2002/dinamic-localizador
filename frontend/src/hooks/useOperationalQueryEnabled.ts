import { useCompany } from "./useCompany";

export function useOperationalQueryEnabled(extraEnabled = true) {
  const { isReady, activeCompany, isLoading } = useCompany();

  return {
    companyId: activeCompany?.companyId,
    enabled: extraEnabled && isReady && Boolean(activeCompany?.companyId),
    isCompanyLoading: isLoading,
  };
}
