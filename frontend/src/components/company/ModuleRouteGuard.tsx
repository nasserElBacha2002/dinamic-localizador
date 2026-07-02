import { Button, Stack, Text, Title } from "@mantine/core";
import type { PropsWithChildren } from "react";
import { Link as RouterLink } from "react-router-dom";
import { LoadingState, SectionCard } from "../../design-system";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import type { CompanyModuleKey } from "../../types/company-module";
import { isAnyModuleEnabled, isModuleEnabled } from "../../utils/company-modules";

interface ModuleRouteGuardProps extends PropsWithChildren {
  moduleKey?: CompanyModuleKey;
  anyOf?: CompanyModuleKey[];
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
