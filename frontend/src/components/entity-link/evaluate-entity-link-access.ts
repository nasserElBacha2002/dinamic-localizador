import type { CompanyModule } from "../../types/company-module";
import {
  isAnyModuleEnabled,
  isModuleEnabled,
} from "../../utils/company-modules";
import { hasAnyPermission } from "../../utils/permissions";
import type { FeatureRouteAccess } from "../../routes/navigable-entity-definitions";

export type EntityLinkAccessState = "loading" | "allowed" | "denied";

export type EntityAccessDeniedReason =
  | "platform_admin"
  | "module"
  | "permission"
  | "modules_unavailable";

export type EntityAccessDecision =
  | { status: "loading" }
  | { status: "allowed" }
  | { status: "denied"; reason: EntityAccessDeniedReason };

export interface EntityLinkAccessContext {
  authLoading: boolean;
  isPlatformAdmin: boolean | undefined;
  modulesLoading: boolean;
  modulesError: boolean;
  modules: CompanyModule[] | undefined;
  permissionsLoading: boolean;
  permissions: readonly string[] | undefined;
}

/**
 * Pure access evaluation shared by EntityLink and FeatureRouteGuard.
 * Does not fetch data — callers supply already-loaded context.
 */
export function evaluateEntityLinkAccess(
  definition: FeatureRouteAccess,
  context: EntityLinkAccessContext,
): EntityAccessDecision {
  if (definition.requirePlatformAdmin) {
    if (context.authLoading) {
      return { status: "loading" };
    }
    return context.isPlatformAdmin
      ? { status: "allowed" }
      : { status: "denied", reason: "platform_admin" };
  }

  const needsModules = Boolean(definition.moduleKey || definition.anyModuleOf?.length);
  const needsPermissions = Boolean(definition.requiredAnyPermission?.length);

  if (needsModules && context.modulesLoading) {
    return { status: "loading" };
  }
  if (needsPermissions && context.permissionsLoading) {
    return { status: "loading" };
  }

  if (needsModules) {
    if (context.modulesError || !context.modules) {
      return { status: "denied", reason: "modules_unavailable" };
    }
    const enabled = definition.moduleKey
      ? isModuleEnabled(context.modules, definition.moduleKey)
      : isAnyModuleEnabled(context.modules, definition.anyModuleOf ?? []);
    if (!enabled) {
      return { status: "denied", reason: "module" };
    }
  }

  if (
    definition.requiredAnyPermission &&
    definition.requiredAnyPermission.length > 0 &&
    !hasAnyPermission(context.permissions, definition.requiredAnyPermission)
  ) {
    return { status: "denied", reason: "permission" };
  }

  return { status: "allowed" };
}

export function toEntityLinkAccessState(decision: EntityAccessDecision): EntityLinkAccessState {
  if (decision.status === "allowed") {
    return "allowed";
  }
  if (decision.status === "loading") {
    return "loading";
  }
  return "denied";
}
