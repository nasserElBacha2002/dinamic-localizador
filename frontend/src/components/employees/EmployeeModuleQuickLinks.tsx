import { Button, Group } from "@mantine/core";
import { Link } from "react-router";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { filterEmployeeModuleQuickLinks } from "../../utils/employee-module-quick-links";

export interface EmployeeModuleQuickLinksProps {
  employeeId: string;
}

/**
 * Compact secondary links from employee edit → filtered list/report modules.
 * Real `<a>` via React Router `Link` so middle-click / open-in-new-tab work.
 *
 * Access policy (safe default):
 * - While modules/permissions load → hide links.
 * - On modules/permissions error → hide links (never show potentially unauthorized destinations).
 * - Visibility uses MODULE_ROUTE_ACCESS (same matrix as sidebar + route guards).
 */
export function EmployeeModuleQuickLinks({ employeeId }: EmployeeModuleQuickLinksProps) {
  const modulesQuery = useCompanyModules();
  const permissionsQuery = useCompanyPermissions();
  const modules = modulesQuery.data;
  const permissions = permissionsQuery.data?.permissions;

  if (modulesQuery.isPending || permissionsQuery.isPending) {
    return null;
  }

  // Fail closed: do not render destinations when access metadata is unavailable.
  if (modulesQuery.isError || permissionsQuery.isError || !modules) {
    return null;
  }

  const links = filterEmployeeModuleQuickLinks(employeeId, modules, permissions);
  if (links.length === 0) {
    return null;
  }

  return (
    <Group gap="xs" wrap="wrap" justify="flex-end" data-testid="employee-module-quick-links">
      {links.map((link) => (
        <Button
          key={link.accessKey}
          component={Link}
          to={link.to}
          variant="default"
          size="compact-sm"
        >
          {link.label}
        </Button>
      ))}
    </Group>
  );
}
