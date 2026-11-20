import { PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS } from "../../constants/billing-company-exemption";

export const normalizeCompanyId = (companyId: string): string => companyId.trim().toUpperCase();

export const companyNamesMatchForExemption = (actualName: string, expectedName: string): boolean =>
  actualName.trim().localeCompare(expectedName.trim(), undefined, { sensitivity: "accent" }) === 0;

export const findProtectedStrategicExemptionByCompanyId = (
  companyId: string,
): (typeof PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS)[number] | null => {
  const normalized = normalizeCompanyId(companyId);
  return (
    PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS.find(
      (entry) => normalizeCompanyId(entry.companyId) === normalized,
    ) ?? null
  );
};

export const isProtectedStrategicCompanyId = (companyId: string): boolean =>
  findProtectedStrategicExemptionByCompanyId(companyId) !== null;