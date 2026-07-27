import { ActiveCompanyRequiredError } from "../api/company-path";

export function requireCompanyId(companyId: string | undefined): string {
  if (!companyId) {
    throw new ActiveCompanyRequiredError();
  }
  return companyId;
}
