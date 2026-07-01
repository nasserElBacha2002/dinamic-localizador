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
  createdAt: string;
  updatedAt: string;
}

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
  | "reports:export";

export type CompanyScope = {
  companyId: string;
};
