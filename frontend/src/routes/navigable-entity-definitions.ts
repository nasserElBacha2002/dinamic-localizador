import type { CompanyModuleKey } from "../types/company-module";
import type { CompanyPermission } from "../types/permissions";
import { MODULE_ROUTE_ACCESS } from "../utils/company-modules";
import { getEntityDetailPath } from "../utils/entity-routes";

/**
 * Navigable entities with a real detail route in AppRoutes.
 * Do not add fictional domain entities (client/supplier/aisle/etc.).
 */
export type NavigableEntityType =
  | "employee"
  | "service"
  | "workTeam"
  | "operation"
  | "attendance"
  | "absence"
  | "payrollReceipt"
  | "whatsappConversation";

/**
 * Canonical detail-route + access metadata.
 * Single source for AppRoutes FeatureRouteGuard, EntityLink registry, and tests.
 */
export interface NavigableEntityDefinition {
  /** Build detail path for a non-empty id (already encoded). */
  buildPath: (encodedId: string) => string;
  moduleKey?: CompanyModuleKey;
  anyModuleOf?: readonly CompanyModuleKey[];
  requiredAnyPermission?: readonly CompanyPermission[];
  requirePlatformAdmin?: boolean;
}

export type FeatureRouteAccess = Omit<NavigableEntityDefinition, "buildPath">;

export const NAVIGABLE_ENTITY_DEFINITIONS: Record<
  NavigableEntityType,
  NavigableEntityDefinition
> = {
  employee: {
    buildPath: (id) => getEntityDetailPath("employees", id),
    anyModuleOf: ["attendance", "operations", "absences"],
    requiredAnyPermission: ["employees:read", "employees:manage"],
  },
  service: {
    buildPath: (id) => getEntityDetailPath("services", id),
    moduleKey: "operations",
    requiredAnyPermission: ["services:read", "services:manage"],
  },
  workTeam: {
    buildPath: (id) => getEntityDetailPath("work-teams", id),
    anyModuleOf: ["attendance", "operations", "absences"],
    requiredAnyPermission: ["employees:read", "employees:manage"],
  },
  operation: {
    buildPath: (id) => getEntityDetailPath("operations", id),
    moduleKey: "operations",
    requiredAnyPermission: ["operations:read", "operations:manage"],
  },
  attendance: {
    buildPath: (id) => `/attendance/${id}`,
    moduleKey: MODULE_ROUTE_ACCESS.attendance.moduleKey,
    requiredAnyPermission: MODULE_ROUTE_ACCESS.attendance.requiredAnyPermission,
  },
  absence: {
    buildPath: (id) => `/absences/${id}`,
    moduleKey: MODULE_ROUTE_ACCESS.absences.moduleKey,
    requiredAnyPermission: MODULE_ROUTE_ACCESS.absences.requiredAnyPermission,
  },
  payrollReceipt: {
    buildPath: (id) => `/payroll-receipts/${id}`,
    moduleKey: MODULE_ROUTE_ACCESS.payroll_receipts.moduleKey,
    requiredAnyPermission: MODULE_ROUTE_ACCESS.payroll_receipts.requiredAnyPermission,
  },
  whatsappConversation: {
    buildPath: (id) => `/platform/observability/whatsapp/${id}`,
    requirePlatformAdmin: true,
  },
};

/** Access props for FeatureRouteGuard (path builder excluded). */
export function featureAccessOf(entityType: NavigableEntityType): FeatureRouteAccess {
  const definition = NAVIGABLE_ENTITY_DEFINITIONS[entityType];
  return {
    moduleKey: definition.moduleKey,
    anyModuleOf: definition.anyModuleOf,
    requiredAnyPermission: definition.requiredAnyPermission,
    requirePlatformAdmin: definition.requirePlatformAdmin,
  };
}

export function listNavigableEntityTypes(): NavigableEntityType[] {
  return Object.keys(NAVIGABLE_ENTITY_DEFINITIONS) as NavigableEntityType[];
}
