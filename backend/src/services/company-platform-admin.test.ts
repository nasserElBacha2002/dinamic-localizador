import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePermissionsForRole, roleHasPermission } from "../constants/company-permissions";
import { buildPlatformAdminMembership } from "../utils/platform-admin-membership";
import { platformAdminService } from "./platform-admin.service";

describe("platform admin", () => {
  it("detects platform admin from users.is_platform_admin", () => {
    assert.equal(platformAdminService.isPlatformAdmin({ isPlatformAdmin: true }), true);
    assert.equal(platformAdminService.isPlatformAdmin({ isPlatformAdmin: false }), false);
    assert.equal(platformAdminService.isPlatformAdmin(null), false);
  });

  it("grants synthetic OWNER membership for any company", () => {
    const membership = buildPlatformAdminMembership(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    );
    assert.equal(membership.role, "OWNER");
    assert.equal(membership.companyId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    assert.ok(roleHasPermission(membership.role, "users:manage"));
    assert.ok(roleHasPermission(membership.role, "employees:manage"));
  });
});

describe("company permissions by role", () => {
  it("grants OWNER representative operational and admin permissions", () => {
    assert.ok(roleHasPermission("OWNER", "company:settings:update"));
    assert.ok(roleHasPermission("OWNER", "users:manage"));
    assert.ok(roleHasPermission("OWNER", "employees:manage"));
    assert.ok(roleHasPermission("OWNER", "reports:export"));
  });

  it("denies ADMIN users:manage but allows operational manage", () => {
    assert.ok(!roleHasPermission("ADMIN", "users:manage"));
    assert.ok(roleHasPermission("ADMIN", "employees:manage"));
    assert.ok(roleHasPermission("ADMIN", "company:settings:update"));
  });

  it("limits READ_ONLY to read permissions only", () => {
    const readPermissions = [
      "company:read",
      "employees:read",
      "services:read",
      "operations:read",
      "attendance:read",
      "absences:read",
      "reports:read",
    ] as const;

    for (const permission of readPermissions) {
      assert.ok(roleHasPermission("READ_ONLY", permission));
    }

    assert.ok(!roleHasPermission("READ_ONLY", "company:settings:update"));
    assert.ok(!roleHasPermission("READ_ONLY", "employees:manage"));
    assert.ok(!roleHasPermission("READ_ONLY", "reports:export"));
  });

  it("maps HR to employees and absences without attendance review", () => {
    assert.ok(roleHasPermission("HR", "employees:manage"));
    assert.ok(roleHasPermission("HR", "absences:review"));
    assert.ok(!roleHasPermission("HR", "attendance:review"));
  });

  it("maps SUPERVISOR to attendance review and operation read", () => {
    assert.ok(roleHasPermission("SUPERVISOR", "attendance:review"));
    assert.ok(roleHasPermission("SUPERVISOR", "operations:read"));
    assert.ok(!roleHasPermission("SUPERVISOR", "employees:manage"));
  });

  it("maps OPERATOR to operations and attendance read only", () => {
    assert.ok(roleHasPermission("OPERATOR", "operations:read"));
    assert.ok(roleHasPermission("OPERATOR", "attendance:read"));
    assert.ok(!roleHasPermission("OPERATOR", "employees:read"));
    assert.ok(!roleHasPermission("OPERATOR", "operations:manage"));
  });

  it("includes all defined permissions for OWNER without brittle size assertions", () => {
    const ownerPermissions = resolvePermissionsForRole("OWNER");
    assert.ok(ownerPermissions.has("company:read"));
    assert.ok(ownerPermissions.has("users:manage"));
    assert.ok(ownerPermissions.has("reports:export"));
  });
});
