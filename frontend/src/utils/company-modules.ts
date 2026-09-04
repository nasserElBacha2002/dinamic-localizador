import { terminology } from "../domain/terminology";
import type { CompanyModule, CompanyModuleKey } from "../types/company-module";
import type { CompanyPermission } from "../types/permissions";
import { hasAnyPermission } from "./permissions";
import { isWhatsappObservabilityUiEnabled } from "./whatsapp-observability-config";

export const CORE_COMPANY_MODULE_KEYS: CompanyModuleKey[] = [
  "attendance",
  "operations",
  "absences",
];

export const COMPANY_MODULE_LABELS: Record<CompanyModuleKey, string> = {
  attendance: terminology.attendance.plural,
  operations: terminology.operation.plural,
  absences: terminology.absence.plural,
  payroll_receipts: "Recibos de sueldo",
  reports: "Reportes",
  bot_simulator: "Simulador de Bot",
};

export const COMPANY_MODULE_DESCRIPTIONS: Record<CompanyModuleKey, string> = {
  attendance: "Permite registrar y revisar asistencias.",
  operations: `Habilita ${terminology.service.plural.toLowerCase()}, ${terminology.operation.plural.toLowerCase()} y asignaciones.`,
  absences: "Permite gestionar tipos y solicitudes de ausencia.",
  payroll_receipts: "Permite cargar y consultar recibos de sueldo por período.",
  reports: "Habilita estadísticas y reportes.",
  bot_simulator: "Permite probar flujos conversacionales del bot.",
};

export interface AdminNavItem {
  label: string;
  path: string;
  section: NavSectionKey;
}

export type NavSectionKey = "general" | "operation" | "management" | "tools" | "settings";

export interface GetAdminNavItemsInput {
  modules: CompanyModule[] | undefined;
  permissions: string[] | undefined;
  isPlatformAdmin: boolean;
  modulesLoading: boolean;
}

export function isModuleEnabled(
  modules: CompanyModule[] | undefined,
  moduleKey: CompanyModuleKey,
): boolean {
  if (!modules) {
    return false;
  }

  return modules.some((module) => module.moduleKey === moduleKey && module.isEnabled);
}

export function isAnyModuleEnabled(
  modules: CompanyModule[] | undefined,
  moduleKeys: readonly CompanyModuleKey[],
): boolean {
  return moduleKeys.some((moduleKey) => isModuleEnabled(modules, moduleKey));
}

export function hasCoreModuleEnabled(modules: CompanyModule[]): boolean {
  return isAnyModuleEnabled(modules, CORE_COMPANY_MODULE_KEYS);
}

export function validateCompanyModulesUpdate(modules: CompanyModule[]): string | null {
  if (!hasCoreModuleEnabled(modules)) {
    return "Debe quedar habilitado al menos un módulo operativo.";
  }

  return null;
}

export function moduleStatesEqual(a: CompanyModule[], b: CompanyModule[]): boolean {
  const enabledByKey = new Map(a.map((module) => [module.moduleKey, module.isEnabled]));
  return b.every((module) => enabledByKey.get(module.moduleKey) === module.isEnabled);
}

/**
 * Shared module ↔ permission matrix for route guards, sidebar, and contextual links.
 * Keep FeatureRouteGuard / getAdminNavItems / EmployeeModuleQuickLinks in sync via this map.
 */
export const MODULE_ROUTE_ACCESS = {
  attendance: {
    moduleKey: "attendance" as const,
    requiredAnyPermission: [
      "attendance:read",
      "attendance:review",
      "attendance:export",
    ] as const satisfies readonly CompanyPermission[],
  },
  absences: {
    moduleKey: "absences" as const,
    requiredAnyPermission: [
      "absences:read",
      "absences:review",
    ] as const satisfies readonly CompanyPermission[],
  },
  payroll_receipts: {
    moduleKey: "payroll_receipts" as const,
    requiredAnyPermission: [
      "payroll_receipts:read",
      "payroll_receipts:upload",
      "payroll_receipts:manage",
      "payroll_receipts:download",
    ] as const satisfies readonly CompanyPermission[],
  },
  reports: {
    moduleKey: "reports" as const,
    /** Reading Estadísticas requires reports:read. Export alone must not grant access. */
    requiredAnyPermission: ["reports:read"] as const satisfies readonly CompanyPermission[],
  },
  operations: {
    moduleKey: "operations" as const,
    requiredAnyPermission: [
      "operations:read",
      "operations:manage",
    ] as const satisfies readonly CompanyPermission[],
  },
} as const;

export type ModuleRouteAccessKey = keyof typeof MODULE_ROUTE_ACCESS;

export function canAccessModuleRoute(
  modules: CompanyModule[] | undefined,
  permissions: string[] | undefined,
  accessKey: ModuleRouteAccessKey,
): boolean {
  const access = MODULE_ROUTE_ACCESS[accessKey];
  return (
    isModuleEnabled(modules, access.moduleKey) &&
    hasAnyPermission(permissions, access.requiredAnyPermission)
  );
}

function canShowNavItem(
  modules: CompanyModule[] | undefined,
  permissions: string[] | undefined,
  moduleKeys: CompanyModuleKey[] | undefined,
  requiredPermissions: readonly CompanyPermission[],
): boolean {
  if (moduleKeys && !isAnyModuleEnabled(modules, moduleKeys)) {
    return false;
  }

  return hasAnyPermission(permissions, requiredPermissions);
}

export function getAdminNavItems({
  modules,
  permissions,
  isPlatformAdmin,
  modulesLoading,
}: GetAdminNavItemsInput): AdminNavItem[] {
  const items: AdminNavItem[] = [
    { label: "Inicio", path: "/", section: "general" },
    { label: "Seguridad", path: "/settings/security", section: "settings" },
  ];

  if (!modulesLoading) {
    if (
      canShowNavItem(modules, permissions, ["attendance", "operations", "absences"], [
        "employees:read",
        "employees:manage",
      ])
    ) {
      items.push({ label: terminology.worker.plural, path: "/employees", section: "management" });
      items.push({ label: "Grupos de trabajo", path: "/work-teams", section: "management" });
    }

    if (
      canShowNavItem(modules, permissions, ["operations"], [
        "services:read",
        "services:manage",
      ])
    ) {
      items.push({ label: terminology.service.plural, path: "/services", section: "management" });
    }

    if (
      canShowNavItem(modules, permissions, ["operations"], [
        "operations:read",
        "operations:manage",
      ])
    ) {
      items.push({ label: terminology.operation.plural, path: "/operations", section: "operation" });
    }

    if (canAccessModuleRoute(modules, permissions, "attendance")) {
      items.push({ label: terminology.attendance.plural, path: "/attendance", section: "operation" });
    }

    if (canAccessModuleRoute(modules, permissions, "absences")) {
      items.push({ label: terminology.absence.plural, path: "/absences", section: "operation" });
    }

    if (canAccessModuleRoute(modules, permissions, "payroll_receipts")) {
      items.push({
        label: "Recibos de sueldo",
        path: "/payroll-receipts",
        section: "operation",
      });
    }

    if (canAccessModuleRoute(modules, permissions, "reports")) {
      items.push({ label: "Estadísticas", path: "/statistics", section: "operation" });
    }

    if (isPlatformAdmin && isModuleEnabled(modules, "bot_simulator")) {
      items.push({ label: "Simulador de Bot", path: "/bot-simulator", section: "tools" });
    }

    if (
      canShowNavItem(modules, permissions, ["operations", "attendance", "absences"], [
        "operations:manage",
        "services:manage",
        "employees:manage",
      ])
    ) {
      items.push({ label: "Importación", path: "/imports", section: "tools" });
    }
  }

  if (hasAnyPermission(permissions, ["company:settings:update"])) {
    items.push({ label: "Configuración", path: "/settings/company", section: "settings" });
  }

  if (hasAnyPermission(permissions, ["users:manage"])) {
    items.push({ label: "Usuarios de empresa", path: "/settings/users", section: "settings" });
  }

  if (isPlatformAdmin) {
    items.push({ label: "Empresas de plataforma", path: "/platform/companies", section: "settings" });
    items.push({ label: "Estado de servidores", path: "/platform/servers", section: "settings" });
    if (isWhatsappObservabilityUiEnabled()) {
      items.push({
        label: "Observabilidad WhatsApp",
        path: "/platform/observability/whatsapp",
        section: "settings",
      });
    }
  }

  return items;
}

export function getHomeQuickLinks(input: GetAdminNavItemsInput): AdminNavItem[] {
  return getAdminNavItems(input).filter((item) => item.path !== "/");
}
