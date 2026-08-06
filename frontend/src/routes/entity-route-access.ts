/**
 * FeatureRouteGuard permission presets for entity detail / edit routes.
 * Derived from NAVIGABLE_ENTITY_DEFINITIONS — keep manage variants here only.
 */
import { featureAccessOf } from "./navigable-entity-definitions";

export const employeeAccess = featureAccessOf("employee");

export const employeeManage = {
  ...employeeAccess,
  requiredAnyPermission: ["employees:manage"] as const,
};

export const workTeamAccess = featureAccessOf("workTeam");

export const workTeamManage = {
  ...workTeamAccess,
  requiredAnyPermission: ["employees:manage"] as const,
};

export const serviceAccess = featureAccessOf("service");

export const serviceManage = {
  ...serviceAccess,
  requiredAnyPermission: ["services:manage"] as const,
};

export const operationAccess = featureAccessOf("operation");

export const operationManage = {
  ...operationAccess,
  requiredAnyPermission: ["operations:manage"] as const,
};
