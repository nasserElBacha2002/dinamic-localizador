import type { CompanyPermission, CompanyRole } from "../types/company";

const ALL_PERMISSIONS: CompanyPermission[] = [
  "company:read",
  "company:settings:update",
  "users:manage",
  "employees:read",
  "employees:manage",
  "stores:read",
  "stores:manage",
  "inventories:read",
  "inventories:manage",
  "attendance:read",
  "attendance:review",
  "attendance:export",
  "absences:read",
  "absences:review",
  "reports:read",
  "reports:export",
];

const READ_ONLY_PERMISSIONS: CompanyPermission[] = [
  "company:read",
  "employees:read",
  "stores:read",
  "inventories:read",
  "attendance:read",
  "absences:read",
  "reports:read",
];

const ROLE_PERMISSIONS: Record<CompanyRole, CompanyPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter((permission) => permission !== "users:manage"),
  HR: [
    "company:read",
    "employees:read",
    "employees:manage",
    "attendance:read",
    "absences:read",
    "absences:review",
    "reports:read",
  ],
  SUPERVISOR: [
    "company:read",
    "employees:read",
    "stores:read",
    "inventories:read",
    "attendance:read",
    "attendance:review",
    "reports:read",
  ],
  OPERATOR: ["company:read", "inventories:read", "attendance:read"],
  READ_ONLY: READ_ONLY_PERMISSIONS,
};

export const resolvePermissionsForRole = (role: CompanyRole): Set<CompanyPermission> =>
  new Set(ROLE_PERMISSIONS[role]);

export const roleHasPermission = (role: CompanyRole, permission: CompanyPermission): boolean =>
  resolvePermissionsForRole(role).has(permission);
