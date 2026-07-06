import type { CompanyPermission, CompanyRole } from "../types/company";

const ALL_PERMISSIONS: CompanyPermission[] = [
  "company:read",
  "company:settings:update",
  "users:manage",
  "employees:read",
  "employees:manage",
  "services:read",
  "services:manage",
  "operations:read",
  "operations:manage",
  "attendance:read",
  "attendance:review",
  "attendance:export",
  "absences:read",
  "absences:review",
  "reports:read",
  "reports:export",
  "bot_simulator:use",
];

const READ_ONLY_PERMISSIONS: CompanyPermission[] = [
  "company:read",
  "employees:read",
  "services:read",
  "operations:read",
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
    "services:read",
    "operations:read",
    "attendance:read",
    "attendance:review",
    "reports:read",
    "bot_simulator:use",
  ],
  OPERATOR: ["company:read", "operations:read", "attendance:read"],
  READ_ONLY: READ_ONLY_PERMISSIONS,
};

export const resolvePermissionsForRole = (role: CompanyRole): Set<CompanyPermission> =>
  new Set(ROLE_PERMISSIONS[role]);

export const roleHasPermission = (role: CompanyRole, permission: CompanyPermission): boolean =>
  resolvePermissionsForRole(role).has(permission);
