import type { CompanyRole } from "./company-user";

export interface EmployeeOperationalAccessStatus {
  eligible: boolean;
  link: {
    userId: string;
    userName: string;
    userEmail: string;
    membershipStatus: string;
    companyRole: CompanyRole;
  } | null;
  pendingInvitations: Array<{
    id: string;
    email: string;
    status: string;
    expiresAt: string;
  }>;
}
