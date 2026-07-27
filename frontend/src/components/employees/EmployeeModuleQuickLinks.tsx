import { Button, Group } from "@mantine/core";
import { Link } from "react-router";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import type { CompanyModuleKey } from "../../types/company-module";
import type { CompanyPermission } from "../../types/permissions";
import { isModuleEnabled } from "../../utils/company-modules";
import {
  buildEmployeeAbsencesPath,
  buildEmployeeAttendancePath,
  buildEmployeeStatisticsPath,
} from "../../utils/employee-module-links";
import { hasAnyPermission } from "../../utils/permissions";

export interface EmployeeModuleQuickLinksProps {
  employeeId: string;
}

interface QuickLinkDef {
  key: string;
  label: string;
  to: string;
  moduleKey: CompanyModuleKey;
  permissions: readonly CompanyPermission[];
}

/**
 * Compact secondary links from employee edit → filtered list/report modules.
 * Real `<a>` via React Router `Link` so middle-click / open-in-new-tab work.
 */
export function EmployeeModuleQuickLinks({ employeeId }: EmployeeModuleQuickLinksProps) {
  const modulesQuery = useCompanyModules();
  const permissionsQuery = useCompanyPermissions();
  const modules = modulesQuery.data;
  const permissions = permissionsQuery.data?.permissions;

  if (modulesQuery.isPending || permissionsQuery.isPending || !modules) {
    return null;
  }

  const candidates: QuickLinkDef[] = [
    {
      key: "attendance",
      label: "Ver asistencias",
      to: buildEmployeeAttendancePath(employeeId),
      moduleKey: "attendance",
      permissions: ["attendance:read", "attendance:review", "attendance:export"],
    },
    {
      key: "absences",
      label: "Ver ausencias",
      to: buildEmployeeAbsencesPath(employeeId),
      moduleKey: "absences",
      permissions: ["absences:read", "absences:review"],
    },
    {
      key: "statistics",
      label: "Ver estadísticas",
      to: buildEmployeeStatisticsPath(employeeId),
      moduleKey: "reports",
      permissions: ["reports:read", "reports:export"],
    },
  ];

  const links = candidates.filter(
    (link) =>
      isModuleEnabled(modules, link.moduleKey) &&
      hasAnyPermission(permissions, link.permissions),
  );

  if (links.length === 0) {
    return null;
  }

  return (
    <Group gap="xs" wrap="wrap" justify="flex-end">
      {links.map((link) => (
        <Button
          key={link.key}
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
