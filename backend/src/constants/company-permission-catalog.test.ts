import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPANY_ROLES, type CompanyRole } from "../types/company";
import { resolvePermissionsForRole, roleHasPermission } from "./company-permissions";
import {
  buildRoleCapabilities,
  buildRoleRestrictions,
  getRoleHierarchySummary,
  isCompanyRole,
  PERMISSION_CATALOG,
  type RoleRestrictionCode,
} from "./company-permission-catalog";

describe("company-permission-catalog", () => {
  it("documents every CompanyPermission with an exhaustive catalog", () => {
    for (const role of COMPANY_ROLES) {
      for (const permission of resolvePermissionsForRole(role)) {
        assert.ok(
          PERMISSION_CATALOG[permission],
          `missing catalog entry for ${permission} (role ${role})`,
        );
      }
    }
  });

  it("builds capabilities with Spanish labels and no unused hierarchy fields", () => {
    const capabilities = buildRoleCapabilities("ADMIN");
    assert.equal(capabilities.role, "ADMIN");
    assert.equal(capabilities.name, "Administrador");
    assert.equal(capabilities.isSystemRole, true);
    assert.ok(capabilities.permissions.length > 0);
    assert.equal(
      capabilities.permissions.some((permission) => permission.code === "users:manage"),
      false,
    );
    assert.ok(capabilities.permissions.every((permission) => permission.documented === true));
    assert.equal("assignableRoles" in capabilities, false);
    assert.equal("invitableRoles" in capabilities, false);
  });

  it("rejects unknown role codes", () => {
    assert.equal(isCompanyRole("VIEWER"), false);
    assert.equal(isCompanyRole("OWNER"), true);
  });

  it("includes users:manage only for OWNER", () => {
    assert.ok(
      buildRoleCapabilities("OWNER").permissions.some(
        (permission) => permission.code === "users:manage",
      ),
    );
    for (const role of COMPANY_ROLES.filter((item) => item !== "OWNER")) {
      assert.equal(
        buildRoleCapabilities(role).permissions.some(
          (permission) => permission.code === "users:manage",
        ),
        false,
      );
    }
  });

  it("restriction codes align with hierarchy and users:manage for every role", () => {
    for (const role of COMPANY_ROLES) {
      const restrictions = buildRoleRestrictions(role);
      const codes = new Set(restrictions.map((item) => item.code));
      const summary = getRoleHierarchySummary(role);

      assert.ok(codes.has("MODULE_MUST_BE_ENABLED"));
      assert.ok(codes.has("CANNOT_EDIT_SELF"));
      assert.ok(codes.has("CANNOT_DEACTIVATE_SELF"));
      assert.ok(codes.has("MEMBERSHIP_STATUS_GATES_ACTIONS"));

      assert.equal(summary.canManageUsers, roleHasPermission(role, "users:manage"));

      if (summary.canManageUsers) {
        assert.equal(codes.has("CANNOT_MANAGE_USERS"), false);
        assert.ok(codes.has("ONLY_LOWER_RANK_ON_EDIT"));
        if (role === "OWNER") {
          assert.ok(codes.has("OWNER_CAN_INVITE_PEER_OWNERS"));
          assert.ok(summary.invitableRoles.includes("OWNER"));
          assert.equal(summary.assignableRoles.includes("OWNER"), false);
        }
      } else {
        assert.ok(codes.has("CANNOT_MANAGE_USERS"));
        // Hierarchy helpers still list inferior ranks, but users:manage is required to act.
        assert.ok(Array.isArray(summary.assignableRoles));
        assert.ok(Array.isArray(summary.invitableRoles));
      }

      assert.equal(
        restrictions.some((item) => item.message.includes("Si en el futuro")),
        false,
      );
    }
  });

  it("parametrizes restriction presence for OWNER vs non-owners", () => {
    const cases: Array<{
      role: CompanyRole;
      expect: RoleRestrictionCode[];
      forbid: RoleRestrictionCode[];
    }> = [
      {
        role: "OWNER",
        expect: ["OWNER_CAN_INVITE_PEER_OWNERS", "ONLY_LOWER_RANK_ON_EDIT"],
        forbid: ["CANNOT_MANAGE_USERS"],
      },
      {
        role: "ADMIN",
        expect: ["CANNOT_MANAGE_USERS"],
        forbid: ["OWNER_CAN_INVITE_PEER_OWNERS"],
      },
      {
        role: "OPERATOR",
        expect: ["CANNOT_MANAGE_USERS"],
        forbid: ["OWNER_CAN_INVITE_PEER_OWNERS", "ONLY_LOWER_RANK_ON_EDIT"],
      },
    ];

    for (const testCase of cases) {
      const codes = new Set(buildRoleRestrictions(testCase.role).map((item) => item.code));
      for (const code of testCase.expect) {
        assert.ok(codes.has(code), `${testCase.role} missing ${code}`);
      }
      for (const code of testCase.forbid) {
        assert.equal(codes.has(code), false, `${testCase.role} should not have ${code}`);
      }
    }
  });
});
