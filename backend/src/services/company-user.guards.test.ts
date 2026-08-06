import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import {
  assertCompanyUserModificationAllowed,
  assertSelfEditNotAllowed,
  assertSelfMembershipChangeNotAllowed,
  isLastOwnerDemotion,
} from "./company-user.guards";

describe("company user guards", () => {
  it("blocks any self edit", () => {
    assert.throws(
      () => assertSelfEditNotAllowed("user-1", "user-1"),
      (error: unknown) => error instanceof AppError && error.code === "SELF_EDIT_NOT_ALLOWED",
    );
  });

  it("blocks self role change", () => {
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

  it("blocks peer-rank edits", () => {
    assert.throws(
      () =>
        assertCompanyUserModificationAllowed({
          targetUserId: "target-1",
          requesterUserId: "actor-1",
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
        assertCompanyUserModificationAllowed({
          targetUserId: "target-1",
          requesterUserId: "actor-1",
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
        assertCompanyUserModificationAllowed({
          targetUserId: "target-1",
          requesterUserId: "actor-1",
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
      assertCompanyUserModificationAllowed({
        targetUserId: "target-1",
        requesterUserId: "actor-1",
        requesterCompanyRole: "OWNER",
        requesterIsPlatformAdmin: false,
        existing: { role: "ADMIN", status: "ACTIVE" },
        update: { role: "HR", status: "ACTIVE" },
      }),
    );
  });

  it("allows platform admin to edit any non-self membership", () => {
    assert.doesNotThrow(() =>
      assertCompanyUserModificationAllowed({
        targetUserId: "target-1",
        requesterUserId: "actor-1",
        requesterCompanyRole: "OWNER",
        requesterIsPlatformAdmin: true,
        existing: { role: "OWNER", status: "ACTIVE" },
        update: { role: "ADMIN" },
      }),
    );
  });

  it("legacy self helper maps to SELF_EDIT_NOT_ALLOWED", () => {
    assert.throws(
      () =>
        assertSelfMembershipChangeNotAllowed(
          "user-1",
          "user-1",
          false,
          { role: "READ_ONLY" },
          { role: "OWNER", status: "ACTIVE" },
        ),
      (error: unknown) => error instanceof AppError && error.code === "SELF_EDIT_NOT_ALLOWED",
    );
  });

  it("detects last owner demotion scenarios", () => {
    assert.equal(isLastOwnerDemotion("OWNER", "ACTIVE", "ADMIN", undefined), true);
    assert.equal(isLastOwnerDemotion("OWNER", "ACTIVE", undefined, "INACTIVE"), true);
    assert.equal(isLastOwnerDemotion("ADMIN", "ACTIVE", "READ_ONLY", undefined), false);
  });
});
