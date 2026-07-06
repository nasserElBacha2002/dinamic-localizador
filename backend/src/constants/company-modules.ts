export const COMPANY_MODULE_KEYS = {
  ATTENDANCE: "attendance",
  OPERATIONS: "operations",
  ABSENCES: "absences",
  REPORTS: "reports",
  BOT_SIMULATOR: "bot_simulator",
} as const;

export const ALL_COMPANY_MODULE_KEYS = [
  COMPANY_MODULE_KEYS.ATTENDANCE,
  COMPANY_MODULE_KEYS.OPERATIONS,
  COMPANY_MODULE_KEYS.ABSENCES,
  COMPANY_MODULE_KEYS.REPORTS,
  COMPANY_MODULE_KEYS.BOT_SIMULATOR,
] as const;

export type CompanyModuleKey = (typeof ALL_COMPANY_MODULE_KEYS)[number];

export const DEFAULT_COMPANY_MODULE_KEYS: CompanyModuleKey[] = [...ALL_COMPANY_MODULE_KEYS];

export const CORE_COMPANY_MODULE_KEYS: CompanyModuleKey[] = [
  COMPANY_MODULE_KEYS.ATTENDANCE,
  COMPANY_MODULE_KEYS.OPERATIONS,
  COMPANY_MODULE_KEYS.ABSENCES,
];

export function isValidCompanyModuleKey(value: string): value is CompanyModuleKey {
  return (ALL_COMPANY_MODULE_KEYS as readonly string[]).includes(value);
}
