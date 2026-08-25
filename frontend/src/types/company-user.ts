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
  /** Roles the actor may assign on membership update (backend authority). */
  assignableRoles?: CompanyRole[];
  /** Roles the actor may assign when inviting (backend authority). */
  invitableRoles?: CompanyRole[];
}

export interface CompanyUser {
  userId: string;
  name: string;
  email: string;
  /** WhatsApp E.164; null if not configured. */
  phoneNumber: string | null;
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
}

export interface UpdateCompanyUserInput {
  role?: CompanyRole;
  status?: CompanyMembershipStatus;
  isDefault?: boolean;
  phoneNumber?: string | null;
}
