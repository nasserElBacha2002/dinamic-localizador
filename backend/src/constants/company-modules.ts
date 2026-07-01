export const COMPANY_MODULE_KEYS = [
  "attendance",
  "inventory_operations",
  "absences",
  "reports",
  "bot_simulator",
] as const;

export type CompanyModuleKey = (typeof COMPANY_MODULE_KEYS)[number];

export const DEFAULT_COMPANY_MODULE_KEYS: CompanyModuleKey[] = [...COMPANY_MODULE_KEYS];
