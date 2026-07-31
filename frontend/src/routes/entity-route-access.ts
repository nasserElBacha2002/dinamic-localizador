/**
 * FeatureRouteGuard permission presets for entity detail / edit routes.
 * Shared by AppRoutes and integration tests — keep in sync intentionally.
 */

export const employeeAccess = {
  anyModuleOf: ["attendance", "operations", "absences"] as const,
  requiredAnyPermission: ["employees:read", "employees:manage"] as const,
};

export const employeeManage = {
  ...employeeAccess,
  requiredAnyPermission: ["employees:manage"] as const,
};

export const workTeamAccess = {
  ...employeeAccess,
};

export const workTeamManage = {
  ...employeeManage,
};

export const serviceAccess = {
  moduleKey: "operations" as const,
  requiredAnyPermission: ["services:read", "services:manage"] as const,
};

export const serviceManage = {
  ...serviceAccess,
  requiredAnyPermission: ["services:manage"] as const,
};

export const operationAccess = {
  moduleKey: "operations" as const,
  requiredAnyPermission: ["operations:read", "operations:manage"] as const,
};

export const operationManage = {
  ...operationAccess,
  requiredAnyPermission: ["operations:manage"] as const,
};
