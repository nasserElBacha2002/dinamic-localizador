import { createContext } from "react";
import type { CompanyMembershipSummary } from "../types/company";

export type CompanyContextValue = {
  companies: CompanyMembershipSummary[];
  activeCompany: CompanyMembershipSummary | null;
  isLoading: boolean;
  isReady: boolean;
  requiresSelection: boolean;
  selectCompany: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
};

export const CompanyContext = createContext<CompanyContextValue | null>(null);
