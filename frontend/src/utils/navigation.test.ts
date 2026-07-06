import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAdminNavItems } from "./company-modules";
import { groupAdminNavItems } from "./navigation";
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

describe("navigation grouping", () => {
  it("groups nav items into sections and hides empty sections", () => {
    const items = getAdminNavItems({
      modules: allEnabledModules,
      permissions: ["attendance:read", "operations:read"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });

    const sections = groupAdminNavItems(items);
    assert.deepEqual(
      sections.map((section) => section.key),
      ["general", "operation"],
    );
    assert.equal(sections[0]?.items[0]?.path, "/");
    assert.ok(sections[1]?.items.some((item) => item.path === "/operations"));
    assert.ok(sections[1]?.items.some((item) => item.path === "/attendance"));
  });

  it("shows Importación only for operations:manage", () => {
    const readOnly = getAdminNavItems({
      modules: allEnabledModules,
      permissions: ["operations:read"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    assert.equal(
      readOnly.some((item) => item.path === "/operations/import"),
      false,
    );

    const manage = getAdminNavItems({
      modules: allEnabledModules,
      permissions: ["operations:manage"],
      isPlatformAdmin: false,
      modulesLoading: false,
    });
    const importItem = manage.find((item) => item.path === "/operations/import");
    assert.ok(importItem);
    assert.equal(importItem?.section, "tools");
  });
});
