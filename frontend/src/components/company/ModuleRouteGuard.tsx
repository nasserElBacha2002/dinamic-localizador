import { Button, Paper, Stack, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";
import { Link as RouterLink } from "react-router-dom";
import { LoadingState } from "../common/LoadingState";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import type { CompanyModuleKey } from "../../types/company-module";
import { isAnyModuleEnabled, isModuleEnabled } from "../../utils/company-modules";

interface ModuleRouteGuardProps extends PropsWithChildren {
  moduleKey?: CompanyModuleKey;
  anyOf?: CompanyModuleKey[];
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

export function ModuleRouteGuard({ moduleKey, anyOf, children }: ModuleRouteGuardProps) {
  const modulesQuery = useCompanyModules();

  if (modulesQuery.isPending) {
    return <LoadingState message="Cargando módulos..." />;
  }

  if (modulesQuery.isError || !modulesQuery.data) {
    return <DisabledModuleState />;
  }

  const enabled = moduleKey
    ? isModuleEnabled(modulesQuery.data, moduleKey)
    : isAnyModuleEnabled(modulesQuery.data, anyOf ?? []);

  if (!enabled) {
    return <DisabledModuleState />;
  }

  return <>{children}</>;
}
