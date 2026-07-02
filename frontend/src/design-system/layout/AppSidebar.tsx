import { Loader, Stack, Text } from "@mantine/core";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { getAdminNavItems } from "../../utils/company-modules";
import { AppNavLink } from "./AppNavLink";

interface AppSidebarProps {
  onNavigate?: () => void;
}

function isNavItemActive(pathname: string, path: string): boolean {
  if (path === "/") {
    return pathname === "/";
  }

  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const permissionsQuery = useCompanyPermissions();
  const modulesQuery = useCompanyModules();
  const modulesLoading = permissionsQuery.isPending || modulesQuery.isPending;

  const navItems = getAdminNavItems({
    modules: modulesQuery.data,
    permissions: permissionsQuery.data?.permissions,
    isPlatformAdmin: Boolean(user?.isPlatformAdmin),
    modulesLoading,
  });

  return (
    <Stack gap="xs" p="sm" component="nav" aria-label="Navegación principal">
      {navItems.map((item) => (
        <AppNavLink
          key={item.path}
          item={item}
          active={isNavItemActive(location.pathname, item.path)}
          onNavigate={onNavigate}
        />
      ))}
      {modulesLoading ? (
        <Stack gap={4} align="center" mt="sm">
          <Loader size="sm" />
          <Text size="xs" c="dimmed">
            Cargando menú...
          </Text>
        </Stack>
      ) : null}
    </Stack>
  );
}
