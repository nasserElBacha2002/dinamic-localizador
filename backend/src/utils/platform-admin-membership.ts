import type { UserCompanyMembership } from "../types/company";

const PLATFORM_ADMIN_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000001";

export const buildPlatformAdminMembership = (
  userId: string,
  companyId: string,
): UserCompanyMembership => ({
  id: PLATFORM_ADMIN_MEMBERSHIP_ID,
  userId,
  companyId,
  role: "OWNER",
  status: "ACTIVE",
  isDefault: false,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});
