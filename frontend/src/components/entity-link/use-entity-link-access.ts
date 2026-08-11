import { useAuth } from "../../hooks/useAuth";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { NAVIGABLE_ENTITY_DEFINITIONS } from "../../routes/navigable-entity-definitions";
import type { NavigableEntityType } from "./entity-link.types";
import {
  evaluateEntityLinkAccess,
  toEntityLinkAccessState,
  type EntityLinkAccessState,
} from "./evaluate-entity-link-access";
import { useEntityLinkAccessContext } from "./entity-link-access-context";

export type { EntityLinkAccessState };

/**
 * Resolves whether the current user may open the entity detail route.
 * Prefers EntityLinkAccessProvider context; falls back to direct queries for tests.
 */
export function useEntityLinkAccess(entityType: NavigableEntityType): EntityLinkAccessState {
  const definition = NAVIGABLE_ENTITY_DEFINITIONS[entityType];
  const shared = useEntityLinkAccessContext();
  const { user, isLoading: authLoading } = useAuth();
  const needsModules = Boolean(definition.moduleKey || definition.anyModuleOf?.length);
  const needsPermissions = Boolean(definition.requiredAnyPermission?.length);
  const modulesQuery = useCompanyModules(!shared && needsModules);
  const permissionsQuery = useCompanyPermissions(!shared && needsPermissions);

  const context = shared ?? {
    authLoading,
    isPlatformAdmin: user?.isPlatformAdmin,
    modulesLoading: modulesQuery.isLoading,
    modulesError: modulesQuery.isError,
    modules: modulesQuery.data,
    permissionsLoading: permissionsQuery.isLoading,
    permissions: permissionsQuery.data?.permissions,
  };

  return toEntityLinkAccessState(evaluateEntityLinkAccess(definition, context));
}
