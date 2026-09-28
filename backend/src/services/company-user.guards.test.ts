import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import {
  assertCompanyUserModificationAllowed,
  assertDeactivationAllowed,
  assertMembershipMutationAllowed,
  assertPersonalProfileMutationAllowed,
  isActiveToInactiveTransition,
  isLastOwnerDemotion,
} from "./company-user.guards";

describe("company user guards", () => {
  it("detects only ACTIVE → INACTIVE transitions", () => {
    assert.equal(isActiveToInactiveTransition("ACTIVE", "INACTIVE"), true);
    assert.equal(isActiveToInactiveTransition("ACTIVE", "ACTIVE"), false);
    assert.equal(isActiveToInactiveTransition("INACTIVE", "INACTIVE"), false);
    assert.equal(isActiveToInactiveTransition("INACTIVE", "ACTIVE"), false);
    assert.equal(isActiveToInactiveTransition("ACTIVE", undefined), false);
  });

  it("allows self profile / non-inactivating membership updates", () => {
    assert.doesNotThrow(() =>
      assertMembershipMutationAllowed({
        targetUserId: "user-1",
        requesterUserId: "user-1",
        requesterCompanyRole: "OWNER",
        requesterIsPlatformAdmin: false,
        existing: { role: "OWNER", status: "ACTIVE", isDefault: true },
        update: { status: "ACTIVE", isDefault: true },
      }),
    );
  });

  it("blocks self role change and peer role change", () => {
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          targetUserId: "user-1",
          requesterUserId: "user-1",
          requesterCompanyRole: "OWNER",
          requesterIsPlatformAdmin: true,
          existing: { role: "OWNER", status: "ACTIVE", isDefault: false },
          update: { role: "ADMIN" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "USER_UPDATE_FORBIDDEN",
    );
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          targetUserId: "peer-1",
          requesterUserId: "actor-1",
          requesterCompanyRole: "ADMIN",
          requesterIsPlatformAdmin: false,
          existing: { role: "ADMIN", status: "ACTIVE", isDefault: false },
          update: { role: "HR" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "INSUFFICIENT_ROLE_HIERARCHY",
    );
  });

  it("blocks self and peer default-company changes", () => {
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          targetUserId: "user-1",
          requesterUserId: "user-1",
          requesterCompanyRole: "OWNER",
          requesterIsPlatformAdmin: true,
          existing: { role: "OWNER", status: "ACTIVE", isDefault: false },
          update: { isDefault: true },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "USER_UPDATE_FORBIDDEN",
    );
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          targetUserId: "peer-1",
          requesterUserId: "actor-1",
          requesterCompanyRole: "ADMIN",
          requesterIsPlatformAdmin: false,
          existing: { role: "ADMIN", status: "ACTIVE", isDefault: false },
          update: { isDefault: true },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "USER_UPDATE_FORBIDDEN",
    );
  });

  it("blocks self deactivation with SELF_DEACTIVATION_NOT_ALLOWED", () => {
    assert.throws(
      () =>
        assertDeactivationAllowed({
          targetUserId: "user-1",
          requesterUserId: "user-1",
          actorRole: "OWNER",
          targetRole: "OWNER",
          actorIsPlatformAdmin: true,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "SELF_DEACTIVATION_NOT_ALLOWED",
    );
    assert.throws(
      () =>
        assertCompanyUserModificationAllowed({
          targetUserId: "user-1",
          requesterUserId: "user-1",
          requesterCompanyRole: "OWNER",
          requesterIsPlatformAdmin: true,
          existing: { role: "OWNER", status: "ACTIVE" },
          update: { status: "INACTIVE" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "SELF_DEACTIVATION_NOT_ALLOWED",
    );
  });

  it("blocks peer-rank inactivation with TARGET_ROLE_NOT_LOWER", () => {
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          targetUserId: "peer-1",
          requesterUserId: "actor-1",
          requesterCompanyRole: "ADMIN",
          requesterIsPlatformAdmin: false,
          existing: { role: "ADMIN", status: "ACTIVE" },
          update: { status: "INACTIVE" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "TARGET_ROLE_NOT_LOWER",
    );
  });

  it("blocks superior-rank inactivation with TARGET_ROLE_NOT_LOWER", () => {
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          targetUserId: "owner-1",
          requesterUserId: "admin-1",
          requesterCompanyRole: "ADMIN",
          requesterIsPlatformAdmin: false,
          existing: { role: "OWNER", status: "ACTIVE" },
          update: { status: "INACTIVE" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "TARGET_ROLE_NOT_LOWER",
    );
  });

  it("allows superior actor to inactivate inferior target", () => {
    assert.doesNotThrow(() =>
      assertMembershipMutationAllowed({
        targetUserId: "admin-1",
        requesterUserId: "owner-1",
        requesterCompanyRole: "OWNER",
        requesterIsPlatformAdmin: false,
        existing: { role: "ADMIN", status: "ACTIVE" },
        update: { status: "INACTIVE" },
      }),
    );
  });

  it("does not apply inactivation hierarchy when editing peer personal/membership without status change", () => {
    assert.doesNotThrow(() =>
      assertMembershipMutationAllowed({
        targetUserId: "peer-1",
        requesterUserId: "actor-1",
        requesterCompanyRole: "ADMIN",
        requesterIsPlatformAdmin: false,
        existing: { role: "ADMIN", status: "ACTIVE", isDefault: true },
        update: { status: "ACTIVE" },
      }),
    );
  });

  it("does not apply inactivation hierarchy when target is already inactive", () => {
    assert.doesNotThrow(() =>
      assertMembershipMutationAllowed({
        targetUserId: "peer-1",
        requesterUserId: "actor-1",
        requesterCompanyRole: "ADMIN",
        requesterIsPlatformAdmin: false,
        existing: { role: "ADMIN", status: "INACTIVE", isDefault: false },
        update: {},
      }),
    );
  });

  it("still blocks peer role changes via role hierarchy", () => {
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          targetUserId: "peer-1",
          requesterUserId: "actor-1",
          requesterCompanyRole: "ADMIN",
          requesterIsPlatformAdmin: false,
          existing: { role: "ADMIN", status: "ACTIVE" },
          update: { role: "HR" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "INSUFFICIENT_ROLE_HIERARCHY",
    );
  });

  it("blocks promoting target to actor rank or above", () => {
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          targetUserId: "admin-1",
          requesterUserId: "owner-1",
          requesterCompanyRole: "OWNER",
          requesterIsPlatformAdmin: false,
          existing: { role: "ADMIN", status: "ACTIVE" },
          update: { role: "OWNER" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "INSUFFICIENT_ROLE_HIERARCHY",
    );
  });

  it("allows superior actor to edit inferior role", () => {
    assert.doesNotThrow(() =>
      assertMembershipMutationAllowed({
        targetUserId: "admin-1",
        requesterUserId: "owner-1",
        requesterCompanyRole: "OWNER",
        requesterIsPlatformAdmin: false,
        existing: { role: "ADMIN", status: "ACTIVE" },
        update: { role: "HR", status: "ACTIVE" },
      }),
    );
  });

  it("allows platform admin to inactivate any non-self membership", () => {
    assert.doesNotThrow(() =>
      assertMembershipMutationAllowed({
        targetUserId: "owner-2",
        requesterUserId: "platform-1",
        requesterCompanyRole: "OWNER",
        requesterIsPlatformAdmin: true,
        existing: { role: "OWNER", status: "ACTIVE" },
        update: { status: "INACTIVE" },
      }),
    );
  });

  it("applies inactivation restriction even when personal fields are sent together", () => {
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          targetUserId: "user-1",
          requesterUserId: "user-1",
          requesterCompanyRole: "ADMIN",
          requesterIsPlatformAdmin: false,
          existing: { role: "ADMIN", status: "ACTIVE" },
          update: { name: "Yo", email: "yo@example.com", status: "INACTIVE" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "SELF_DEACTIVATION_NOT_ALLOWED",
    );
  });

  it("allows self or platform admin personal profile edits; blocks company peers", () => {
    assert.doesNotThrow(() =>
      assertPersonalProfileMutationAllowed({
        targetUserId: "user-1",
        requesterUserId: "user-1",
        actorIsPlatformAdmin: false,
      }),
    );
    assert.doesNotThrow(() =>
      assertPersonalProfileMutationAllowed({
        targetUserId: "user-2",
        requesterUserId: "platform-1",
        actorIsPlatformAdmin: true,
      }),
    );
    assert.throws(
      () =>
        assertPersonalProfileMutationAllowed({
          targetUserId: "peer-1",
          requesterUserId: "admin-1",
          actorIsPlatformAdmin: false,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "USER_UPDATE_FORBIDDEN",
    );
  });

  it("detects last owner demotion scenarios", () => {
    assert.equal(isLastOwnerDemotion("OWNER", "ACTIVE", "ADMIN", undefined), true);
    assert.equal(isLastOwnerDemotion("OWNER", "ACTIVE", undefined, "INACTIVE"), true);
    assert.equal(isLastOwnerDemotion("ADMIN", "ACTIVE", "READ_ONLY", undefined), false);
  });
});
