import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import {
  assertSelfMembershipChangeNotAllowed,
  isLastOwnerDemotion,
} from "./company-user.guards";

describe("company user guards", () => {
  it("blocks self role change for regular users", () => {
    assert.throws(
      () =>
        assertSelfMembershipChangeNotAllowed(
          "user-1",
          "user-1",
          false,
          { role: "READ_ONLY" },
          { role: "OWNER", status: "ACTIVE" },
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "SELF_MEMBERSHIP_CHANGE_NOT_ALLOWED",
    );
  });

  it("blocks self deactivation for regular users", () => {
    assert.throws(
      () =>
        assertSelfMembershipChangeNotAllowed(
          "user-1",
          "user-1",
          false,
          { status: "INACTIVE" },
          { role: "ADMIN", status: "ACTIVE" },
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "SELF_MEMBERSHIP_CHANGE_NOT_ALLOWED",
    );
  });

  it("allows platform superadmin to change own membership", () => {
    assert.doesNotThrow(() =>
      assertSelfMembershipChangeNotAllowed(
        "user-1",
        "user-1",
        true,
        { role: "READ_ONLY" },
        { role: "OWNER", status: "ACTIVE" },
      ),
    );
  });

  it("detects last owner demotion scenarios", () => {
    assert.equal(isLastOwnerDemotion("OWNER", "ACTIVE", "ADMIN", undefined), true);
    assert.equal(isLastOwnerDemotion("OWNER", "ACTIVE", undefined, "INACTIVE"), true);
    assert.equal(isLastOwnerDemotion("ADMIN", "ACTIVE", "READ_ONLY", undefined), false);
  });
});
