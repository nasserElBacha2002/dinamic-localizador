import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanyRole } from "../types/company";
import { COMPANY_ROLES } from "../types/company";
import { resolvePermissionsForRole, roleHasPermission } from "./company-permissions";
import type { CompanyPermission } from "../types/company";

describe("company permissions", () => {
  it("grants OWNER all permissions", () => {
    const permissions = resolvePermissionsForRole("OWNER");
    assert.ok(roleHasPermission("OWNER", "company:settings:update"));
    assert.ok(roleHasPermission("OWNER", "users:manage"));
    assert.ok(permissions.has("reports:export"));
  });

  it("does not grant bot simulator permission to any company role", () => {
    for (const role of COMPANY_ROLES as readonly CompanyRole[]) {
      const permissions = resolvePermissionsForRole(role);
      assert.equal(
        [...permissions].some((permission) => permission.includes("bot_simulator")),
        false,
        `role ${role} must not include bot simulator permissions`,
      );
    }
  });

  it("limits READ_ONLY to read permissions", () => {
    const readPermissions: CompanyPermission[] = [
      "company:read",
      "employees:read",
      "services:read",
      "operations:read",
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

  it("denies ADMIN users:manage", () => {
    assert.ok(!roleHasPermission("ADMIN", "users:manage"));
    assert.ok(roleHasPermission("ADMIN", "employees:manage"));
  });

  it("denies OPERATOR full read modules", () => {
    assert.ok(!roleHasPermission("OPERATOR", "employees:read"));
    assert.ok(!roleHasPermission("OPERATOR", "services:read"));
    assert.ok(roleHasPermission("OPERATOR", "attendance:read"));
    assert.ok(roleHasPermission("OPERATOR", "operations:read"));
  });

  it("scopes payroll receipts: HR full, SUPERVISOR/READ_ONLY/OPERATOR none", () => {
    for (const permission of [
      "payroll_receipts:read",
      "payroll_receipts:upload",
      "payroll_receipts:manage",
      "payroll_receipts:delete",
      "payroll_receipts:download",
    ] as const) {
      assert.ok(roleHasPermission("OWNER", permission));
      assert.ok(roleHasPermission("ADMIN", permission));
      assert.ok(roleHasPermission("HR", permission));
      assert.ok(!roleHasPermission("SUPERVISOR", permission));
      assert.ok(!roleHasPermission("READ_ONLY", permission));
      assert.ok(!roleHasPermission("OPERATOR", permission));
    }
  });
});
