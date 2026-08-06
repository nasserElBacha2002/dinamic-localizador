import { mockApiModule } from "./mock-api-module";

/** Keep in sync with `api/role-capabilities.api.ts` named exports. */
export const ROLE_CAPABILITIES_API_EXPORTS = ["getRoleCapabilities"] as const;

export function mockRoleCapabilitiesApi(
  namedExports: Partial<Record<(typeof ROLE_CAPABILITIES_API_EXPORTS)[number], unknown>>,
): void {
  mockApiModule("api/role-capabilities.api", namedExports, ROLE_CAPABILITIES_API_EXPORTS);
}

/** Keep in sync with `api/company-users.api.ts` named exports. */
export const COMPANY_USERS_API_EXPORTS = [
  "getCompanyMembership",
  "getCompanyUsers",
  "getCompanyUserById",
  "createCompanyUser",
  "updateCompanyUser",
  "deactivateCompanyUser",
  "getActiveCompanyMembershipPath",
] as const;

/**
 * Mock the company-users API with an explicit complete export list.
 * Prefer this over growing a global registry inside `mockApiModule`.
 */
export function mockCompanyUsersApi(
  namedExports: Partial<Record<(typeof COMPANY_USERS_API_EXPORTS)[number], unknown>>,
): void {
  mockApiModule("api/company-users.api", namedExports, COMPANY_USERS_API_EXPORTS);
}
