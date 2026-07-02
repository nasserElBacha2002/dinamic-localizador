import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { getCompanies } from "../api/companies.api";
import {
  getActiveCompanyId,
  getStoredCompanyId,
  setCompanySelectionRequiredHandler,
  setRuntimeCompanyId,
} from "../api/company-path";
import { useAuth } from "../hooks/useAuth";
import { queryClient } from "../lib/query-client";
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

  return null;
}

export function CompanyProviderGate({ children }: PropsWithChildren) {
  const { isAuthenticated, token } = useAuth();
  const providerKey = isAuthenticated && token ? token : "logged-out";

  return (
    <CompanyProvider key={providerKey}>
      {children}
    </CompanyProvider>
  );
}

export function CompanyProvider({ children }: PropsWithChildren) {
  const { isAuthenticated } = useAuth();
  const [companies, setCompanies] = useState<CompanyMembershipSummary[]>([]);
  const [activeCompany, setActiveCompany] = useState<CompanyMembershipSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const clearActiveCompany = useCallback(() => {
    setActiveCompany(null);
    setRuntimeCompanyId(null);
    queryClient.clear();
  }, []);

  const refreshCompanies = useCallback(async () => {
    const memberships = await getCompanies();
    setCompanies(memberships);

    const currentCompanyId = getActiveCompanyId();
    if (currentCompanyId) {
      const currentMembership = memberships.find(
        (membership) => membership.companyId === currentCompanyId,
      );
      if (currentMembership) {
        setActiveCompany(currentMembership);
        setRuntimeCompanyId(currentMembership.companyId);
        return;
      }
    }

    const resolved = resolveInitialCompany(memberships);
    setActiveCompany(resolved);
    setRuntimeCompanyId(resolved?.companyId ?? null);
  }, []);

  useEffect(() => {
    setCompanySelectionRequiredHandler(() => {
      clearActiveCompany();
    });

    return () => {
      setCompanySelectionRequiredHandler(null);
    };
  }, [clearActiveCompany]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      try {
        await refreshCompanies();
      } catch {
        if (!cancelled) {
          setCompanies([]);
          clearActiveCompany();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, refreshCompanies, clearActiveCompany]);

  const selectCompany = useCallback(
    (companyId: string) => {
      const selected = companies.find((company) => company.companyId === companyId) ?? null;
      setActiveCompany(selected);
      setRuntimeCompanyId(selected?.companyId ?? null);
      queryClient.clear();
    },
    [companies],
  );

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies,
      activeCompany,
      isLoading,
      isReady: !isLoading && Boolean(activeCompany?.companyId),
      requiresSelection: !isLoading && companies.length > 1 && !activeCompany,
      hasNoCompanies: !isLoading && companies.length === 0,
      selectCompany,
      refreshCompanies,
      clearActiveCompany,
    }),
    [companies, activeCompany, isLoading, selectCompany, refreshCompanies, clearActiveCompany],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
