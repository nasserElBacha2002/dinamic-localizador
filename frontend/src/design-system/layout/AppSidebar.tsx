import { Loader, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { getAdminNavItems } from "../../utils/company-modules";
import { groupAdminNavItems } from "../../utils/navigation";
import { AppNavLink } from "./AppNavLink";
import classes from "./app-layout.module.css";

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

  const navSections = useMemo(() => {
    const navItems = getAdminNavItems({
      modules: modulesQuery.data,
      permissions: permissionsQuery.data?.permissions,
      isPlatformAdmin: Boolean(user?.isPlatformAdmin),
      modulesLoading,
    });

    return groupAdminNavItems(navItems);
  }, [
    modulesLoading,
    modulesQuery.data,
    permissionsQuery.data?.permissions,
    user?.isPlatformAdmin,
  ]);

  return (
    <div className={classes.sidebar}>
      <nav className={classes.sidebarInner} aria-label="Navegación principal">
        {navSections.map((section) => (
          <div key={section.key} className={classes.section}>
            {section.key !== "general" ? (
              <Text component="div" className={classes.sectionLabel}>
                {section.label}
              </Text>
            ) : null}
            <Stack gap={2}>
              {section.items.map((item) => (
                <AppNavLink
                  key={item.path}
                  item={item}
                  active={isNavItemActive(location.pathname, item.path)}
                  onNavigate={onNavigate}
                />
              ))}
            </Stack>
          </div>
        ))}

        {modulesLoading ? (
          <Stack gap={4} align="center" className={classes.loading}>
            <Loader size="sm" color="brand" />
            <Text size="xs" c="dimmed">
              Cargando menú...
            </Text>
          </Stack>
        ) : null}
      </nav>
    </div>
  );
}
