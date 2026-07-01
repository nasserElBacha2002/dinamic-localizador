import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePermissionsForRole, roleHasPermission } from "./company-permissions";
import type { CompanyPermission } from "../types/company";

describe("company permissions", () => {
  it("grants OWNER all permissions", () => {
    const permissions = resolvePermissionsForRole("OWNER");
    assert.ok(roleHasPermission("OWNER", "company:settings:update"));
    assert.ok(roleHasPermission("OWNER", "users:manage"));
    assert.ok(roleHasPermission("OWNER", "bot_simulator:use"));
    assert.ok(permissions.has("reports:export"));
  });

  it("limits READ_ONLY to read permissions", () => {
    const readPermissions: CompanyPermission[] = [
      "company:read",
      "employees:read",
      "stores:read",
      "inventories:read",
      "attendance:read",
      "absences:read",
      "reports:read",
    ];

    for (const permission of readPermissions) {
      assert.ok(roleHasPermission("READ_ONLY", permission));
    }

    assert.ok(!roleHasPermission("READ_ONLY", "company:settings:update"));
    assert.ok(!roleHasPermission("READ_ONLY", "employees:manage"));
    assert.ok(!roleHasPermission("READ_ONLY", "bot_simulator:use"));
  });

  it("denies ADMIN users:manage", () => {
    assert.ok(!roleHasPermission("ADMIN", "users:manage"));
    assert.ok(roleHasPermission("ADMIN", "employees:manage"));
    assert.ok(roleHasPermission("ADMIN", "bot_simulator:use"));
  });

  it("denies OPERATOR bot simulator and full read modules", () => {
    assert.ok(!roleHasPermission("OPERATOR", "employees:read"));
    assert.ok(!roleHasPermission("OPERATOR", "stores:read"));
    assert.ok(!roleHasPermission("OPERATOR", "bot_simulator:use"));
    assert.ok(roleHasPermission("OPERATOR", "attendance:read"));
    assert.ok(roleHasPermission("OPERATOR", "inventories:read"));
  });

  it("grants SUPERVISOR bot simulator access", () => {
    assert.ok(roleHasPermission("SUPERVISOR", "bot_simulator:use"));
  });
});
