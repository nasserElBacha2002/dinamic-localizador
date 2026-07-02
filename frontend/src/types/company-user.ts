export type CompanyRole =
  | "OWNER"
  | "ADMIN"
  | "HR"
  | "SUPERVISOR"
  | "OPERATOR"
  | "READ_ONLY";

export type CompanyMembershipStatus = "ACTIVE" | "INACTIVE";

export interface CompanyMembershipContext {
  companyId: string;
  companyName: string;
  role: CompanyRole;
  isPlatformAdmin: boolean;
  permissions: string[];
}

export interface CompanyUser {
  userId: string;
  name: string;
  email: string;
  globalRole: string;
  isPlatformAdmin?: boolean;
  membershipId: string;
  companyId: string;
  companyRole: CompanyRole;
  membershipStatus: CompanyMembershipStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface CompanyUserFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: CompanyRole;
  status?: CompanyMembershipStatus;
}

export interface CreateCompanyUserInput {
  name: string;
  email: string;
  role: CompanyRole;
  status?: CompanyMembershipStatus;
  temporaryPassword?: string;
  isDefault?: boolean;
}

export interface UpdateCompanyUserInput {
  role?: CompanyRole;
  status?: CompanyMembershipStatus;
  isDefault?: boolean;
}
