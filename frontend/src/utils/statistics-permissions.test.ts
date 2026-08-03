import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessModuleRoute, MODULE_ROUTE_ACCESS } from "./company-modules";
import type { CompanyModule } from "../types/company-module";

const modulesFixture = (): CompanyModule[] =>
  (["reports"] as const).map((moduleKey) => ({
    companyId: "co-1",
    moduleKey,
    isEnabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));

describe("Estadísticas permissions policy", () => {
  it("requires reports:read for module access", () => {
    assert.deepEqual([...MODULE_ROUTE_ACCESS.reports.requiredAnyPermission], ["reports:read"]);
    assert.equal(canAccessModuleRoute(modulesFixture(), ["reports:read"], "reports"), true);
    assert.equal(canAccessModuleRoute(modulesFixture(), ["reports:export"], "reports"), false);
    assert.equal(
      canAccessModuleRoute(modulesFixture(), ["reports:read", "reports:export"], "reports"),
      true,
    );
    assert.equal(canAccessModuleRoute(modulesFixture(), [], "reports"), false);
  });
});
