export type CompanyModuleKey =
  | "attendance"
  | "inventory_operations"
  | "absences"
  | "reports"
  | "bot_simulator";

export interface CompanyModule {
  companyId: string;
  moduleKey: CompanyModuleKey;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCompanyModuleItem {
  moduleKey: CompanyModuleKey;
  isEnabled: boolean;
}

export interface UpdateCompanyModulesInput {
  modules: UpdateCompanyModuleItem[];
}
