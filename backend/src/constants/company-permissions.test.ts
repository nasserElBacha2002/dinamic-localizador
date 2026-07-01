import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePermissionsForRole, roleHasPermission } from "../constants/company-permissions";
import type { CompanyPermission } from "../types/company";

describe("company permissions", () => {
  it("grants OWNER all permissions", () => {
    const permissions = resolvePermissionsForRole("OWNER");
    assert.ok(roleHasPermission("OWNER", "company:settings:update"));
    assert.ok(roleHasPermission("OWNER", "users:manage"));
    assert.equal(permissions.size, 16);
  });

  it("denies ADMIN users:manage", () => {
    assert.ok(!roleHasPermission("ADMIN", "users:manage"));
    assert.ok(roleHasPermission("ADMIN", "employees:manage"));
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
  });
});
