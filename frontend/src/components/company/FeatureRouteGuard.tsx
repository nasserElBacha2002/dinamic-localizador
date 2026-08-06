import { Button, Stack, Text, Title } from "@mantine/core";
import type { PropsWithChildren } from "react";
import { Link as RouterLink } from "react-router";
import {
  evaluateEntityLinkAccess,
  type EntityLinkAccessContext,
} from "../entity-link/evaluate-entity-link-access";
import { LoadingState, SectionCard } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import type { CompanyModuleKey } from "../../types/company-module";
import type { CompanyPermission } from "../../types/permissions";
import { useEntityLinkAccessContext } from "../entity-link/entity-link-access-context";

interface FeatureRouteGuardProps extends PropsWithChildren {
  moduleKey?: CompanyModuleKey;
  anyModuleOf?: readonly CompanyModuleKey[];
  requiredAnyPermission?: readonly CompanyPermission[];
  requirePlatformAdmin?: boolean;
}

function DisabledModuleState() {
  return (
    <SectionCard>
      <Stack gap="md" align="center" py="xl">
        <Title order={3}>Módulo no habilitado</Title>
        <Text c="dimmed" ta="center">
          Este módulo no está habilitado para esta empresa.
        </Text>
        <Button component={RouterLink} to="/">
          Volver al inicio
        </Button>
      </Stack>
    </SectionCard>
  );
}

function NoPermissionState() {
  return (
    <SectionCard>
      <Stack gap="md" align="center" py="xl">
        <Title order={3}>Sin permisos</Title>
        <Text c="dimmed" ta="center">
          No tenés permisos para acceder a esta sección.
        </Text>
        <Button component={RouterLink} to="/">
          Volver al inicio
        </Button>
      </Stack>
    </SectionCard>
  );
}

export function FeatureRouteGuard({
  moduleKey,
  anyModuleOf,
  requiredAnyPermission,
  requirePlatformAdmin = false,
  children,
}: FeatureRouteGuardProps) {
  const shared = useEntityLinkAccessContext();
  const { user, isLoading: authLoading } = useAuth();
  const needsModules = Boolean(moduleKey || anyModuleOf);
  const needsCompanyPermissions = Boolean(requiredAnyPermission?.length);
  const modulesQuery = useCompanyModules(!shared && needsModules);
  const permissionsQuery = useCompanyPermissions(!shared && needsCompanyPermissions);

  const context: EntityLinkAccessContext = shared ?? {
    authLoading,
    isPlatformAdmin: user?.isPlatformAdmin,
    modulesLoading: modulesQuery.isLoading,
    modulesError: modulesQuery.isError,
    modules: modulesQuery.data,
    permissionsLoading: permissionsQuery.isLoading,
    permissions: permissionsQuery.data?.permissions,
  };

  const decision = evaluateEntityLinkAccess(
    {
      moduleKey,
      anyModuleOf,
      requiredAnyPermission,
      requirePlatformAdmin,
    },
    context,
  );

  if (decision.status === "loading") {
    return <LoadingState message="Cargando acceso..." />;
  }

  if (decision.status === "denied") {
    if (decision.reason === "module" || decision.reason === "modules_unavailable") {
      return <DisabledModuleState />;
    }
    return <NoPermissionState />;
  }

  return <>{children}</>;
}
