import type { CompanyModule, CompanyModuleKey } from "../types/company-module";
import type { CompanyPermission } from "../types/permissions";
import { hasAnyPermission } from "./permissions";

export const CORE_COMPANY_MODULE_KEYS: CompanyModuleKey[] = [
  "attendance",
  "inventory_operations",
  "absences",
];

export const COMPANY_MODULE_LABELS: Record<CompanyModuleKey, string> = {
  attendance: "Asistencias",
  inventory_operations: "Operaciones de inventario",
  absences: "Ausencias",
  reports: "Reportes",
  bot_simulator: "Simulador de Bot",
};

export const COMPANY_MODULE_DESCRIPTIONS: Record<CompanyModuleKey, string> = {
  attendance: "Permite registrar y revisar asistencias.",
  inventory_operations: "Habilita tiendas, inventarios y asignaciones.",
  absences: "Permite gestionar tipos y solicitudes de ausencia.",
  reports: "Habilita estadísticas y reportes.",
  bot_simulator: "Permite probar flujos conversacionales del bot.",
};

export interface AdminNavItem {
  label: string;
  path: string;
}

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

function canShowNavItem(
  modules: CompanyModule[] | undefined,
  permissions: string[] | undefined,
  moduleKeys: CompanyModuleKey[] | undefined,
  requiredPermissions: CompanyPermission[],
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
  const items: AdminNavItem[] = [{ label: "Inicio", path: "/" }];

  if (!modulesLoading) {
    if (
      canShowNavItem(modules, permissions, ["attendance", "inventory_operations", "absences"], [
        "employees:read",
        "employees:manage",
      ])
    ) {
      items.push({ label: "Empleados", path: "/employees" });
    }

    if (
      canShowNavItem(modules, permissions, ["inventory_operations"], [
        "stores:read",
        "stores:manage",
      ])
    ) {
      items.push({ label: "Tiendas", path: "/stores" });
    }

    if (
      canShowNavItem(modules, permissions, ["inventory_operations"], [
        "inventories:read",
        "inventories:manage",
      ])
    ) {
      items.push({ label: "Inventarios", path: "/inventories" });
    }

    if (
      canShowNavItem(modules, permissions, ["attendance"], [
        "attendance:read",
        "attendance:review",
        "attendance:export",
      ])
    ) {
      items.push({ label: "Asistencias", path: "/attendance" });
    }

    if (
      canShowNavItem(modules, permissions, ["absences"], ["absences:read", "absences:review"])
    ) {
      items.push({ label: "Ausencias", path: "/absences" });
    }

    if (
      canShowNavItem(modules, permissions, ["reports"], ["reports:read", "reports:export"])
    ) {
      items.push({ label: "Estadísticas", path: "/statistics" });
    }

    if (canShowNavItem(modules, permissions, ["bot_simulator"], ["bot_simulator:use"])) {
      items.push({ label: "Simulador de Bot", path: "/bot-simulator" });
    }
  }

  if (hasAnyPermission(permissions, ["company:settings:update"])) {
    items.push({ label: "Configuración de empresa", path: "/settings/company" });
  }

  if (hasAnyPermission(permissions, ["users:manage"])) {
    items.push({ label: "Usuarios de empresa", path: "/settings/users" });
  }

  if (isPlatformAdmin) {
    items.push({ label: "Empresas de plataforma", path: "/platform/companies" });
  }

  return items;
}

export function getHomeQuickLinks(input: GetAdminNavItemsInput): AdminNavItem[] {
  return getAdminNavItems(input).filter((item) => item.path !== "/");
}
