import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  getAdminNavItems,
  COMPANY_MODULE_LABELS,
  isAnyModuleEnabled,
  isModuleEnabled,
  moduleStatesEqual,
  validateCompanyModulesUpdate,
} from "../utils/company-modules";
import { terminology } from "../domain/terminology";
import type { CompanyModule } from "../types/company-module";

const allEnabledModules: CompanyModule[] = [
  "attendance",
  "operations",
  "absences",
  "payroll_receipts",
  "reports",
  "bot_simulator",
].map((moduleKey) => ({
  companyId: "company-1",
  moduleKey: moduleKey as CompanyModule["moduleKey"],
  isEnabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}));

describe("company modules frontend module", () => {
  it("uses scoped API client for company modules", () => {
    const apiFile = readFileSync(join(process.cwd(), "src/api/company-modules.api.ts"), "utf8");
    assert.match(apiFile, /scopedApiClient/);
    assert.match(apiFile, /"modules"/);
    assert.doesNotMatch(apiFile, /apiClient\.(get|patch)\(\s*["'`]modules/);
  });

  it("scopes modules path with active company id", () => {
    const companyPathFile = readFileSync(join(process.cwd(), "src/api/company-path.ts"), "utf8");
    assert.match(companyPathFile, /"modules"/);
  });

  it("includes companyId in modules query key and mutation invalidation", () => {
    const hooksFile = readFileSync(join(process.cwd(), "src/hooks/useCompanyModules.ts"), "utf8");
    const queryFile = readFileSync(join(process.cwd(), "src/hooks/company-modules-query.ts"), "utf8");
    assert.match(hooksFile, /useOperationalQueryEnabled/);
    assert.match(hooksFile, /companyModulesQueryKey/);
    assert.match(queryFile, /COMPANY_MODULES_STALE_TIME_MS/);
    assert.match(queryFile, /refetchOnWindowFocus: false/);
    assert.doesNotMatch(hooksFile, /getActiveCompanyId/);
  });

  it("hides Ausencias when absences module is disabled", () => {
    const modules = allEnabledModules.map((module) =>
      module.moduleKey === "absences" ? { ...module, isEnabled: false } : module,
    );
    const items = getAdminNavItems({
      modules,
      permissions: ["absences:read"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    assert.equal(
      items.some((item) => item.path === "/absences"),
      false,
    );
  });

  it("hides Recibos de sueldo when payroll_receipts module is disabled", () => {
    const modules = allEnabledModules.map((module) =>
      module.moduleKey === "payroll_receipts" ? { ...module, isEnabled: false } : module,
    );
    const items = getAdminNavItems({
      modules,
      permissions: ["payroll_receipts:read"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    assert.equal(
      items.some((item) => item.path === "/payroll-receipts"),
      false,
    );
  });

  it("shows Recibos de sueldo when module and permission are present", () => {
    const items = getAdminNavItems({
      modules: allEnabledModules,
      permissions: ["payroll_receipts:read"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    const item = items.find((entry) => entry.path === "/payroll-receipts");
    assert.ok(item);
    assert.equal(item?.label, "Recibos de sueldo");
    assert.equal(item?.section, "operation");
  });

  it("hides Estadísticas when reports module is disabled", () => {
    const modules = allEnabledModules.map((module) =>
      module.moduleKey === "reports" ? { ...module, isEnabled: false } : module,
    );
    const items = getAdminNavItems({
      modules,
      permissions: ["reports:read"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    assert.equal(
      items.some((item) => item.path === "/statistics"),
      false,
    );
  });

  it("shows only Operaciones and Asistencias for OPERATOR with all modules enabled", () => {
    const items = getAdminNavItems({
      modules: allEnabledModules,
      permissions: ["company:read", "operations:read", "attendance:read"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    const paths = items.map((item) => item.path);
    const labels = items.map((item) => item.label);
    assert.deepEqual(paths, ["/", "/settings/security", "/operations", "/attendance"]);
    assert.deepEqual(labels, [
      "Inicio",
      "Seguridad",
      terminology.operation.plural,
      terminology.attendance.plural,
    ]);
  });

  it("uses generic terminology labels for OWNER nav items", () => {
    const items = getAdminNavItems({
      modules: allEnabledModules,
      permissions: [
        "company:read",
        "employees:read",
        "services:read",
        "operations:read",
        "attendance:read",
        "absences:read",
        "reports:read",
        "company:settings:update",
        "users:manage",
      ],
      isPlatformAdmin: true,
      modulesLoading: false,
    });
    const labels = items.map((item) => item.label);
    assert.ok(labels.includes(terminology.worker.plural));
    assert.ok(labels.includes(terminology.service.plural));
    assert.ok(labels.includes(terminology.operation.plural));
    assert.ok(labels.includes(terminology.attendance.plural));
    assert.ok(labels.includes("Estado de servidores"));
    assert.ok(items.some((item) => item.path === "/platform/servers"));
  });

  it("shows Simulador de Bot only for platform superadmin when module is enabled", () => {
    const asSuperAdmin = getAdminNavItems({
      modules: allEnabledModules,
      permissions: ["company:settings:update"],
      isPlatformAdmin: true,
      modulesLoading: false,
    });
    assert.equal(
      asSuperAdmin.some((item) => item.path === "/bot-simulator"),
      true,
    );

    const asOwner = getAdminNavItems({
      modules: allEnabledModules,
      permissions: ["company:settings:update", "users:manage"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    assert.equal(
      asOwner.some((item) => item.path === "/bot-simulator"),
      false,
    );
  });

  it("shows Estado de servidores only for platform Super Admin", () => {
    const asSuperAdmin = getAdminNavItems({
      modules: allEnabledModules,
      permissions: ["company:settings:update"],
      isPlatformAdmin: true,
      modulesLoading: false,
    });
    assert.equal(
      asSuperAdmin.some((item) => item.path === "/platform/servers"),
      true,
    );

    const asCompanyAdmin = getAdminNavItems({
      modules: allEnabledModules,
      permissions: ["company:settings:update", "users:manage"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    assert.equal(
      asCompanyAdmin.some((item) => item.path === "/platform/servers"),
      false,
    );
    assert.equal(
      asCompanyAdmin.some((item) => item.label === "Estado de servidores"),
      false,
    );
  });

  it("exposes generic module labels while keeping operations key", () => {
    assert.equal(COMPANY_MODULE_LABELS.operations, terminology.operation.plural);
    assert.equal(COMPANY_MODULE_LABELS.attendance, terminology.attendance.plural);
  });

  it("hides nav items when permission is missing even if module is enabled", () => {
    const items = getAdminNavItems({
      modules: allEnabledModules,
      permissions: ["attendance:read"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    assert.equal(items.some((item) => item.path === "/employees"), false);
    assert.equal(items.some((item) => item.path === "/operations"), false);
  });

  it("validates at least one core module remains enabled", () => {
    const disabledCore = allEnabledModules.map((module) => ({
      ...module,
      isEnabled: !["attendance", "operations", "absences"].includes(module.moduleKey),
    }));
    assert.equal(
      validateCompanyModulesUpdate(disabledCore),
      "Debe quedar habilitado al menos un módulo operativo.",
    );
  });

  it("evaluates module helpers", () => {
    const modules = allEnabledModules.map((module) =>
      module.moduleKey === "reports" ? { ...module, isEnabled: false } : module,
    );
    assert.equal(isModuleEnabled(modules, "attendance"), true);
    assert.equal(isModuleEnabled(modules, "reports"), false);
    assert.equal(
      isAnyModuleEnabled(modules, ["attendance", "operations", "absences"]),
      true,
    );
  });

  it("compares module states by key without relying on array order", () => {
    const reordered = [...allEnabledModules].reverse();
    assert.equal(moduleStatesEqual(allEnabledModules, reordered), true);
    const changed = allEnabledModules.map((module) =>
      module.moduleKey === "reports" ? { ...module, isEnabled: false } : module,
    );
    assert.equal(moduleStatesEqual(allEnabledModules, changed), false);
  });

  it("guards routes with FeatureRouteGuard", () => {
    const guardFile = readFileSync(
      join(process.cwd(), "src/components/company/FeatureRouteGuard.tsx"),
      "utf8",
    );
    assert.match(guardFile, /Módulo no habilitado/);
    assert.match(guardFile, /No tenés permisos para acceder a esta sección/);
    assert.match(guardFile, /useCompanyModules/);
    assert.match(guardFile, /useCompanyPermissions/);
  });

  it("uses multi-select lookups on attendance filters", () => {
    const attendancePage = readFileSync(
      join(process.cwd(), "src/pages/attendance/AttendanceListPage.tsx"),
      "utf8",
    );
    assert.match(attendancePage, /EmployeeMultiSelect/);
    assert.match(attendancePage, /ServiceMultiSelect/);
    assert.match(attendancePage, /OperationMultiSelect/);
    assert.doesNotMatch(attendancePage, /EmployeeLookupAutocomplete/);
    assert.doesNotMatch(attendancePage, /ServiceLookupAutocomplete/);
    assert.doesNotMatch(attendancePage, /OperationLookupAutocomplete/);
    assert.doesNotMatch(attendancePage, /EmployeeSearchAutocomplete/);
    assert.doesNotMatch(attendancePage, /ServiceSearchAutocomplete/);
  });

  it("does not use forbidden employee APIs on HomePage", () => {
    const homePage = readFileSync(join(process.cwd(), "src/pages/HomePage.tsx"), "utf8");
    assert.doesNotMatch(homePage, /getHomeQuickLinks/);
    assert.doesNotMatch(homePage, /useEmployees/);
  });
});
