import type { CompanyRole } from "./company-user";

export interface RoleCapabilityPermission {
  code: string;
  module: string;
  label: string;
  description: string;
  documented: boolean;
}

export interface RoleRestriction {
  code: string;
  message: string;
}

export interface RoleCapabilities {
  role: CompanyRole;
  name: string;
  description: string;
  isSystemRole: boolean;
  permissions: RoleCapabilityPermission[];
  restrictions: RoleRestriction[];
}
