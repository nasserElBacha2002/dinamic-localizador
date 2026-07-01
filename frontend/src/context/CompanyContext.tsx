import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { getCompanies } from "../api/companies.api";
import { getStoredCompanyId, setRuntimeCompanyId } from "../api/company-path";
import { useAuth } from "../hooks/useAuth";
import { CompanyContext, type CompanyContextValue } from "./company-context";
import type { CompanyMembershipSummary } from "../types/company";

function resolveInitialCompany(
  companies: CompanyMembershipSummary[],
): CompanyMembershipSummary | null {
  if (companies.length === 0) {
    return null;
  }

  if (companies.length === 1) {
    return companies[0];
  }

  const storedId = getStoredCompanyId();
  if (storedId) {
    const stored = companies.find((company) => company.companyId === storedId);
    if (stored) {
      return stored;
    }
  }

  const defaultCompany = companies.find((company) => company.isDefault);
  return defaultCompany ?? null;
}

export function CompanyProvider({ children }: PropsWithChildren) {
  const { isAuthenticated } = useAuth();
  const [companies, setCompanies] = useState<CompanyMembershipSummary[]>([]);
  const [activeCompany, setActiveCompany] = useState<CompanyMembershipSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCompanies = useCallback(async () => {
    const memberships = await getCompanies();
    setCompanies(memberships);
    const resolved = resolveInitialCompany(memberships);
    setActiveCompany(resolved);
    setRuntimeCompanyId(resolved?.companyId ?? null);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setCompanies([]);
      setActiveCompany(null);
      setRuntimeCompanyId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void refreshCompanies()
      .catch(() => {
        setCompanies([]);
        setActiveCompany(null);
        setRuntimeCompanyId(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isAuthenticated, refreshCompanies]);

  const selectCompany = useCallback(
    (companyId: string) => {
      const selected = companies.find((company) => company.companyId === companyId) ?? null;
      setActiveCompany(selected);
      setRuntimeCompanyId(selected?.companyId ?? null);
    },
    [companies],
  );

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies,
      activeCompany,
      isLoading,
      isReady: Boolean(activeCompany),
      requiresSelection: companies.length > 1 && !activeCompany,
      selectCompany,
      refreshCompanies,
    }),
    [companies, activeCompany, isLoading, selectCompany, refreshCompanies],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
