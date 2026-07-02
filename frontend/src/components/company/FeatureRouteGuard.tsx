import { Button, Stack, Text, Title } from "@mantine/core";
import type { PropsWithChildren } from "react";
import { Link as RouterLink } from "react-router-dom";
import { LoadingState, SectionCard } from "../../design-system";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import type { CompanyModuleKey } from "../../types/company-module";
import type { CompanyPermission } from "../../types/permissions";
import { isAnyModuleEnabled, isModuleEnabled } from "../../utils/company-modules";
import { hasAnyPermission } from "../../utils/permissions";

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
  const modulesQuery = useCompanyModules();
  const permissionsQuery = useCompanyPermissions();

  if (modulesQuery.isPending || permissionsQuery.isPending) {
    return <LoadingState message="Cargando acceso..." />;
  }

  if (requirePlatformAdmin && !permissionsQuery.data?.isPlatformAdmin) {
    return <NoPermissionState />;
  }

  if (moduleKey || anyModuleOf) {
    if (modulesQuery.isError || !modulesQuery.data) {
      return <DisabledModuleState />;
    }

    const moduleEnabled = moduleKey
      ? isModuleEnabled(modulesQuery.data, moduleKey)
      : isAnyModuleEnabled(modulesQuery.data, anyModuleOf ?? []);

    if (!moduleEnabled) {
      return <DisabledModuleState />;
    }
  }

  if (
    requiredAnyPermission &&
    requiredAnyPermission.length > 0 &&
    !hasAnyPermission(permissionsQuery.data?.permissions, requiredAnyPermission)
  ) {
    return <NoPermissionState />;
  }

  return <>{children}</>;
}
