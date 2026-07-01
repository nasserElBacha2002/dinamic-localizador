import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roleHasPermission } from "../constants/company-permissions";

describe("company user management permissions", () => {
  it("allows OWNER to manage company users", () => {
    assert.equal(roleHasPermission("OWNER", "users:manage"), true);
  });

  it("denies ADMIN users:manage", () => {
    assert.equal(roleHasPermission("ADMIN", "users:manage"), false);
  });

  it("denies HR users:manage", () => {
    assert.equal(roleHasPermission("HR", "users:manage"), false);
  });

  it("denies READ_ONLY users:manage", () => {
    assert.equal(roleHasPermission("READ_ONLY", "users:manage"), false);
  });
});
