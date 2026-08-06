import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAssignCompanyRole,
  canAssignRoleOnInvitation,
  getCompanyUserEditBlockReason,
  getEditBlockMessage,
  isStrictlySuperiorRole,
  listAssignableCompanyRoles,
  listInvitableCompanyRoles,
  USER_SELF_EDIT_BLOCKED_MESSAGE,
} from "./company-role-hierarchy";

describe("company-role-hierarchy (frontend)", () => {
  it("blocks self and peer/superior edits", () => {
    assert.equal(
      getCompanyUserEditBlockReason({
        actorUserId: "u1",
        actorRole: "OWNER",
        actorIsPlatformAdmin: true,
        targetUserId: "u1",
        targetRole: "OWNER",
      }),
      "self",
    );
    assert.equal(USER_SELF_EDIT_BLOCKED_MESSAGE.includes("otro usuario autorizado"), true);
    assert.equal(
      getEditBlockMessage("self"),
      USER_SELF_EDIT_BLOCKED_MESSAGE,
    );
    assert.equal(
      getCompanyUserEditBlockReason({
        actorUserId: "u1",
        actorRole: "OWNER",
        actorIsPlatformAdmin: false,
        targetUserId: "u2",
        targetRole: "OWNER",
      }),
      "hierarchy",
    );
    assert.equal(
      getCompanyUserEditBlockReason({
        actorUserId: "u1",
        actorRole: "OWNER",
        actorIsPlatformAdmin: false,
        targetUserId: "u2",
        targetRole: "ADMIN",
      }),
      null,
    );
  });

  it("filters assignable vs invitable roles", () => {
    assert.equal(isStrictlySuperiorRole("OWNER", "ADMIN"), true);
    assert.equal(canAssignCompanyRole("OWNER", "OWNER", false), false);
    assert.equal(canAssignRoleOnInvitation("OWNER", "OWNER", false), true);
    assert.deepEqual(listAssignableCompanyRoles("OWNER", false), [
      "ADMIN",
      "HR",
      "SUPERVISOR",
      "OPERATOR",
      "READ_ONLY",
    ]);
    assert.deepEqual(listInvitableCompanyRoles("OWNER", false), [
      "OWNER",
      "ADMIN",
      "HR",
      "SUPERVISOR",
      "OPERATOR",
      "READ_ONLY",
    ]);
  });
});
