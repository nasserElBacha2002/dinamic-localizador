import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NAVIGABLE_ENTITY_DEFINITIONS,
  featureAccessOf,
} from "../../routes/navigable-entity-definitions";
import { employeeAccess, serviceAccess } from "../../routes/entity-route-access";
import {
  ENTITY_ROUTE_REGISTRY,
  listNavigableEntityTypes,
  normalizeEntityId,
  resolveEntityDetailPath,
} from "./entity-route-registry";

describe("entity-route-registry", () => {
  it("builds a detail path for every registered entity", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    for (const entityType of listNavigableEntityTypes()) {
      const path = resolveEntityDetailPath(entityType, id);
      assert.ok(path, entityType);
      assert.ok(path.includes(encodeURIComponent(id)) || path.includes(id), entityType);
      assert.equal(path.startsWith("/"), true);
    }
  });

  it("returns null for missing ids", () => {
    assert.equal(resolveEntityDetailPath("employee", null), null);
    assert.equal(resolveEntityDetailPath("employee", "  "), null);
    assert.equal(normalizeEntityId(undefined), null);
    assert.equal(normalizeEntityId(42), "42");
  });

  it("encodes special characters in ids", () => {
    const path = resolveEntityDetailPath("service", "a/b c");
    assert.equal(path, `/services/${encodeURIComponent("a/b c")}`);
  });

  it("shares canonical definitions with FeatureRouteGuard presets", () => {
    assert.equal(ENTITY_ROUTE_REGISTRY, NAVIGABLE_ENTITY_DEFINITIONS);
    assert.deepEqual(employeeAccess, featureAccessOf("employee"));
    assert.deepEqual(serviceAccess, featureAccessOf("service"));
    assert.ok(ENTITY_ROUTE_REGISTRY.employee.requiredAnyPermission?.includes("employees:read"));
    assert.equal(ENTITY_ROUTE_REGISTRY.service.moduleKey, "operations");
    assert.equal(ENTITY_ROUTE_REGISTRY.whatsappConversation.requirePlatformAdmin, true);
    assert.equal(ENTITY_ROUTE_REGISTRY.attendance.moduleKey, "attendance");
    assert.equal(ENTITY_ROUTE_REGISTRY.absence.moduleKey, "absences");
    assert.equal(ENTITY_ROUTE_REGISTRY.payrollReceipt.moduleKey, "payroll_receipts");
  });
});
