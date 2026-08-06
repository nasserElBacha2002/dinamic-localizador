import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import {
  assertCompanyUserModificationAllowed,
  assertMembershipMutationAllowed,
  assertSelfAdministrativeMutationAllowed,
  isLastOwnerDemotion,
} from "./company-user.guards";

describe("company user guards", () => {
  it("blocks any self edit", () => {
    assert.throws(
      () => assertSelfAdministrativeMutationAllowed("user-1", "user-1"),
      (error: unknown) => error instanceof AppError && error.code === "SELF_EDIT_NOT_ALLOWED",
    );
  });

  it("blocks self role change via composed guard", () => {
    assert.throws(
      () =>
        assertCompanyUserModificationAllowed({
          targetUserId: "user-1",
          requesterUserId: "user-1",
          requesterCompanyRole: "OWNER",
          requesterIsPlatformAdmin: false,
          existing: { role: "OWNER", status: "ACTIVE" },
          update: { role: "READ_ONLY" },
        }),
      (error: unknown) => error instanceof AppError && error.code === "SELF_EDIT_NOT_ALLOWED",
    );
  });

  it("blocks self deactivation", () => {
    assert.throws(
      () =>
        assertCompanyUserModificationAllowed({
          targetUserId: "user-1",
          requesterUserId: "user-1",
          requesterCompanyRole: "OWNER",
          requesterIsPlatformAdmin: false,
          existing: { role: "ADMIN", status: "ACTIVE" },
          update: { status: "INACTIVE" },
        }),
      (error: unknown) => error instanceof AppError && error.code === "SELF_EDIT_NOT_ALLOWED",
    );
  });

  it("blocks platform admin (SUPER_ADMIN) from any self field change", () => {
    for (const update of [
      { role: "READ_ONLY" as const },
      { status: "INACTIVE" as const },
      { isDefault: false },
      { role: "ADMIN" as const, status: "ACTIVE" as const, isDefault: true },
    ]) {
      assert.throws(
        () =>
          assertCompanyUserModificationAllowed({
            targetUserId: "super-1",
            requesterUserId: "super-1",
            requesterCompanyRole: "OWNER",
            requesterIsPlatformAdmin: true,
            existing: { role: "OWNER", status: "ACTIVE" },
            update,
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "SELF_EDIT_NOT_ALLOWED" &&
          error.message.includes("otro usuario autorizado"),
      );
    }
  });

  it("blocks peer-rank edits via membership phase", () => {
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          requesterCompanyRole: "ADMIN",
          requesterIsPlatformAdmin: false,
          existing: { role: "ADMIN", status: "ACTIVE" },
          update: { status: "INACTIVE" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "INSUFFICIENT_ROLE_HIERARCHY",
    );
  });

  it("blocks editing a superior rank", () => {
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          requesterCompanyRole: "ADMIN",
          requesterIsPlatformAdmin: false,
          existing: { role: "OWNER", status: "ACTIVE" },
          update: { role: "READ_ONLY" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "INSUFFICIENT_ROLE_HIERARCHY",
    );
  });

  it("blocks promoting target to actor rank or above", () => {
    assert.throws(
      () =>
        assertMembershipMutationAllowed({
          requesterCompanyRole: "OWNER",
          requesterIsPlatformAdmin: false,
          existing: { role: "ADMIN", status: "ACTIVE" },
          update: { role: "OWNER" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "INSUFFICIENT_ROLE_HIERARCHY",
    );
  });

  it("allows superior actor to edit inferior target", () => {
    assert.doesNotThrow(() =>
      assertMembershipMutationAllowed({
        requesterCompanyRole: "OWNER",
        requesterIsPlatformAdmin: false,
        existing: { role: "ADMIN", status: "ACTIVE" },
        update: { role: "HR", status: "ACTIVE" },
      }),
    );
  });

  it("allows platform admin to edit any non-self membership", () => {
    assert.doesNotThrow(() =>
      assertMembershipMutationAllowed({
        requesterCompanyRole: "OWNER",
        requesterIsPlatformAdmin: true,
        existing: { role: "OWNER", status: "ACTIVE" },
        update: { role: "ADMIN" },
      }),
    );
  });

  it("detects last owner demotion scenarios", () => {
    assert.equal(isLastOwnerDemotion("OWNER", "ACTIVE", "ADMIN", undefined), true);
    assert.equal(isLastOwnerDemotion("OWNER", "ACTIVE", undefined, "INACTIVE"), true);
    assert.equal(isLastOwnerDemotion("ADMIN", "ACTIVE", "READ_ONLY", undefined), false);
  });
});
