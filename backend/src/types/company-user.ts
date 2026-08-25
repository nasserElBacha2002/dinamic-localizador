import type { CompanyMembershipStatus, CompanyRole } from "../types/company";

export interface CompanyUserDto {
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

export interface CreateCompanyUserResult {
  data: CompanyUserDto;
  message: string;
}
