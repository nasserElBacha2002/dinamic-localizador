export const COMPANY_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const COMPANY_MEMBERSHIP_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type CompanyMembershipStatus = (typeof COMPANY_MEMBERSHIP_STATUSES)[number];

export const COMPANY_ROLES = [
  "OWNER",
  "ADMIN",
  "HR",
  "SUPERVISOR",
  "OPERATOR",
  "READ_ONLY",
] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  country: string | null;
  defaultTimezone: string;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserCompanyMembership {
  id: string;
  userId: string;
  companyId: string;
  role: CompanyRole;
  status: CompanyMembershipStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyMembershipSummary {
  companyId: string;
  companyName: string;
  role: CompanyRole;
  isDefault: boolean;
  status: CompanyMembershipStatus;
}

export interface CompanySettings {
  id: string;
  companyId: string;
  operationTimezone: string;
  defaultRadiusMeters: number;
  lateGraceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  requireCheckoutLocation: boolean;
  allowManualAttendanceCorrections: boolean;
  defaultEarlyArrivalToleranceMinutes: number;
  defaultLateArrivalToleranceMinutes: number;
  defaultOperationStartTime: string | null;
  defaultOperationEndTime: string | null;
  geofenceReviewMarginMeters: number | null;
  createdAt: string;
  updatedAt: string;
}

export type CompanySettingsDto = Omit<CompanySettings, "id">;

export interface CompanyAbsenceSetting {
  id: string;
  companyId: string;
  absenceTypeCode: string;
  defaultAnnualDays: number;
  autoAssignOnEmployeeCreate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyLocationType {
  id: string;
  companyId: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyModule {
  id: string;
  companyId: string;
  moduleKey: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CompanyModuleDto = Omit<CompanyModule, "id"> & {
  moduleKey: import("../constants/company-modules").CompanyModuleKey;
};

export type CompanyPermission =
  | "company:read"
  | "company:settings:update"
  | "users:manage"
  | "employees:read"
  | "employees:manage"
  | "stores:read"
  | "stores:manage"
  | "inventories:read"
  | "inventories:manage"
  | "attendance:read"
  | "attendance:review"
  | "attendance:export"
  | "absences:read"
  | "absences:review"
  | "reports:read"
  | "reports:export"
  | "bot_simulator:use";

export type CompanyScope = {
  companyId: string;
};
