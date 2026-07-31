import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanyModule } from "../types/company-module";
import {
  canAccessModuleRoute,
  MODULE_ROUTE_ACCESS,
} from "./company-modules";
import { filterEmployeeModuleQuickLinks } from "./employee-module-quick-links";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

const modulesFixture = (): CompanyModule[] =>
  (["attendance", "absences", "reports"] as const).map((moduleKey) => ({
    companyId: "co-1",
    moduleKey,
    isEnabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));

describe("MODULE_ROUTE_ACCESS shared matrix", () => {
  it("matches FeatureRouteGuard / sidebar permission sets", () => {
    assert.deepEqual(
      [...MODULE_ROUTE_ACCESS.attendance.requiredAnyPermission],
      ["attendance:read", "attendance:review", "attendance:export"],
    );
    assert.deepEqual(
      [...MODULE_ROUTE_ACCESS.absences.requiredAnyPermission],
      ["absences:read", "absences:review"],
    );
    assert.deepEqual(
      [...MODULE_ROUTE_ACCESS.reports.requiredAnyPermission],
      ["reports:read", "reports:export"],
    );
  });

  it("accepts alternate valid permissions like attendance:review", () => {
    assert.equal(
      canAccessModuleRoute(modulesFixture(), ["attendance:review"], "attendance"),
      true,
    );
  });

  it("rejects when module is disabled or permission is missing", () => {
    const disabledAbsences = modulesFixture().map((module) =>
      module.moduleKey === "absences" ? { ...module, isEnabled: false } : module,
    );
    assert.equal(canAccessModuleRoute(disabledAbsences, ["absences:read"], "absences"), false);
    assert.equal(canAccessModuleRoute(modulesFixture(), ["employees:read"], "reports"), false);
  });
});

describe("filterEmployeeModuleQuickLinks", () => {
  it("hides absences when that module is disabled", () => {
    const modules = modulesFixture().map((module) =>
      module.moduleKey === "absences" ? { ...module, isEnabled: false } : module,
    );
    const links = filterEmployeeModuleQuickLinks(EMPLOYEE_ID, modules, [
      "attendance:read",
      "absences:read",
      "reports:read",
    ]);
    assert.deepEqual(
      links.map((link) => link.accessKey),
      ["attendance", "reports"],
    );
  });

  it("hides reports when that module is disabled", () => {
    const modules = modulesFixture().map((module) =>
      module.moduleKey === "reports" ? { ...module, isEnabled: false } : module,
    );
    const links = filterEmployeeModuleQuickLinks(EMPLOYEE_ID, modules, [
      "attendance:read",
      "absences:read",
      "reports:read",
    ]);
    assert.deepEqual(
      links.map((link) => link.accessKey),
      ["attendance", "absences"],
    );
  });

  it("hides attendance when permission is missing", () => {
    const links = filterEmployeeModuleQuickLinks(EMPLOYEE_ID, modulesFixture(), [
      "absences:read",
      "reports:read",
    ]);
    assert.deepEqual(
      links.map((link) => link.accessKey),
      ["absences", "reports"],
    );
  });

  it("returns no links when nothing is available", () => {
    assert.deepEqual(filterEmployeeModuleQuickLinks(EMPLOYEE_ID, modulesFixture(), []), []);
  });
});
