import { Button, Paper, Stack, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";
import { Link as RouterLink } from "react-router-dom";
import { LoadingState } from "../common/LoadingState";
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
    <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
      <Stack spacing={2} alignItems="center">
        <Typography variant="h5" component="h1">
          Módulo no habilitado
        </Typography>
        <Typography color="text.secondary">
          Este módulo no está habilitado para esta empresa.
        </Typography>
        <Button component={RouterLink} to="/" variant="contained">
          Volver al inicio
        </Button>
      </Stack>
    </Paper>
  );
}

function NoPermissionState() {
  return (
    <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
      <Stack spacing={2} alignItems="center">
        <Typography variant="h5" component="h1">
          Sin permisos
        </Typography>
        <Typography color="text.secondary">
          No tenés permisos para acceder a esta sección.
        </Typography>
        <Button component={RouterLink} to="/" variant="contained">
          Volver al inicio
        </Button>
      </Stack>
    </Paper>
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
