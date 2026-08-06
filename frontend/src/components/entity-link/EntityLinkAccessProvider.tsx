import { useMemo, type PropsWithChildren } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import type { EntityLinkAccessContext } from "./evaluate-entity-link-access";
import { EntityLinkAccessReactContext } from "./entity-link-access-context";

/**
 * Loads modules/permissions once for the protected shell so EntityLink cells
 * share one observer pair instead of N React Query subscriptions.
 */
export function EntityLinkAccessProvider({ children }: PropsWithChildren) {
  const { user, isLoading: authLoading } = useAuth();
  const modulesQuery = useCompanyModules(true);
  const permissionsQuery = useCompanyPermissions(true);

  const value = useMemo<EntityLinkAccessContext>(
    () => ({
      authLoading,
      isPlatformAdmin: user?.isPlatformAdmin,
      modulesLoading: modulesQuery.isLoading,
      modulesError: modulesQuery.isError,
      modules: modulesQuery.data,
      permissionsLoading: permissionsQuery.isLoading,
      permissions: permissionsQuery.data?.permissions,
    }),
    [
      authLoading,
      user?.isPlatformAdmin,
      modulesQuery.isLoading,
      modulesQuery.isError,
      modulesQuery.data,
      permissionsQuery.isLoading,
      permissionsQuery.data?.permissions,
    ],
  );

  return (
    <EntityLinkAccessReactContext.Provider value={value}>
      {children}
    </EntityLinkAccessReactContext.Provider>
  );
}
