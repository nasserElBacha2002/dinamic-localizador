import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAssignCompanyRole,
  canAssignRoleOnInvitation,
  canEditPersonalProfile,
  getCompanyUserDeactivationBlockReason,
  getDeactivationBlockMessage,
  isStrictlySuperiorRole,
  listAssignableCompanyRoles,
  listInvitableCompanyRoles,
  resolveCompanyUserCapabilities,
  USER_SELF_DEACTIVATION_BLOCKED_MESSAGE,
} from "./company-role-hierarchy";

describe("company-role-hierarchy (frontend)", () => {
  it("blocks self and peer/superior privileged actions only", () => {
    assert.equal(
      getCompanyUserDeactivationBlockReason({
        actorUserId: "u1",
        actorRole: "OWNER",
        actorIsPlatformAdmin: true,
        targetUserId: "u1",
        targetRole: "OWNER",
      }),
      "self",
    );
    assert.equal(
      USER_SELF_DEACTIVATION_BLOCKED_MESSAGE.includes("inactivar tu propio usuario"),
      true,
    );
    assert.equal(
      getDeactivationBlockMessage("self"),
      USER_SELF_DEACTIVATION_BLOCKED_MESSAGE,
    );
    assert.equal(
      getCompanyUserDeactivationBlockReason({
        actorUserId: "u1",
        actorRole: "OWNER",
        actorIsPlatformAdmin: false,
        targetUserId: "u2",
        targetRole: "OWNER",
      }),
      "hierarchy",
    );
    assert.equal(
      getCompanyUserDeactivationBlockReason({
        actorUserId: "u1",
        actorRole: "OWNER",
        actorIsPlatformAdmin: false,
        targetUserId: "u2",
        targetRole: "ADMIN",
      }),
      null,
    );
  });

  it("resolves split capabilities for self vs inferior vs peer", () => {
    assert.equal(
      canEditPersonalProfile({
        actorUserId: "u1",
        actorIsPlatformAdmin: false,
        targetUserId: "u1",
      }),
      true,
    );
    assert.equal(
      canEditPersonalProfile({
        actorUserId: "u1",
        actorIsPlatformAdmin: false,
        targetUserId: "u2",
      }),
      false,
    );

    const selfCaps = resolveCompanyUserCapabilities({
      actorUserId: "u1",
      actorRole: "OWNER",
      actorIsPlatformAdmin: false,
      targetUserId: "u1",
      targetRole: "OWNER",
      targetStatus: "ACTIVE",
    });
    assert.deepEqual(selfCaps, {
      canEditProfile: true,
      canChangeRole: false,
      canChangeDefaultCompany: false,
      canDeactivate: false,
      canReactivate: false,
    });

    const inferiorCaps = resolveCompanyUserCapabilities({
      actorUserId: "u1",
      actorRole: "ADMIN",
      actorIsPlatformAdmin: false,
      targetUserId: "u2",
      targetRole: "HR",
      targetStatus: "ACTIVE",
    });
    assert.equal(inferiorCaps.canEditProfile, false);
    assert.equal(inferiorCaps.canChangeRole, true);
    assert.equal(inferiorCaps.canDeactivate, true);
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
