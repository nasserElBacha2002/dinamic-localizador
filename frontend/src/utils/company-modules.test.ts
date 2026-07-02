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
  "inventory_operations",
  "absences",
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
      permissions: ["company:read", "inventories:read", "attendance:read"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    const paths = items.map((item) => item.path);
    const labels = items.map((item) => item.label);
    assert.deepEqual(paths, ["/", "/inventories", "/attendance"]);
    assert.deepEqual(labels, ["Inicio", terminology.operation.plural, terminology.attendance.plural]);
  });

  it("uses generic terminology labels for OWNER nav items", () => {
    const items = getAdminNavItems({
      modules: allEnabledModules,
      permissions: [
        "company:read",
        "employees:read",
        "stores:read",
        "inventories:read",
        "attendance:read",
        "absences:read",
        "reports:read",
        "bot_simulator:use",
        "company:settings:update",
        "users:manage",
      ],
      isPlatformAdmin: true,
      modulesLoading: false,
    });
    const labels = items.map((item) => item.label);
    assert.ok(labels.includes(terminology.worker.plural));
    assert.ok(labels.includes(terminology.location.plural));
    assert.ok(labels.includes(terminology.operation.plural));
    assert.ok(labels.includes(terminology.attendance.plural));
  });

  it("exposes generic module labels while keeping inventory_operations key", () => {
    assert.equal(COMPANY_MODULE_LABELS.inventory_operations, terminology.operation.plural);
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
    assert.equal(items.some((item) => item.path === "/inventories"), false);
  });

  it("validates at least one core module remains enabled", () => {
    const disabledCore = allEnabledModules.map((module) => ({
      ...module,
      isEnabled: !["attendance", "inventory_operations", "absences"].includes(module.moduleKey),
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
      isAnyModuleEnabled(modules, ["attendance", "inventory_operations", "absences"]),
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

  it("uses lookup autocompletes on attendance filters", () => {
    const attendancePage = readFileSync(
      join(process.cwd(), "src/pages/attendance/AttendanceListPage.tsx"),
      "utf8",
    );
    assert.match(attendancePage, /EmployeeLookupAutocomplete/);
    assert.match(attendancePage, /StoreLookupAutocomplete/);
    assert.match(attendancePage, /InventoryLookupAutocomplete/);
    assert.doesNotMatch(attendancePage, /EmployeeSearchAutocomplete/);
    assert.doesNotMatch(attendancePage, /StoreSearchAutocomplete/);
  });

  it("does not use forbidden employee APIs on HomePage", () => {
    const homePage = readFileSync(join(process.cwd(), "src/pages/HomePage.tsx"), "utf8");
    assert.doesNotMatch(homePage, /getHomeQuickLinks/);
    assert.doesNotMatch(homePage, /useEmployees/);
  });
});
