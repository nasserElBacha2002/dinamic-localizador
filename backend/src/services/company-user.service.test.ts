import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roleHasPermission } from "../constants/company-permissions";
import { companyUserService } from "./company-user.service";

describe("company user service rules", () => {
  it("OWNER has users:manage permission", () => {
    assert.equal(roleHasPermission("OWNER", "users:manage"), true);
  });

  it("ADMIN cannot manage users", () => {
    assert.equal(roleHasPermission("ADMIN", "users:manage"), false);
  });

  it("READ_ONLY cannot manage users", () => {
    assert.equal(roleHasPermission("READ_ONLY", "users:manage"), false);
  });

  it("HR cannot manage users", () => {
    assert.equal(roleHasPermission("HR", "users:manage"), false);
  });

  it("does not expose temporaryPassword in create service return type", () => {
    const createSource = companyUserService.create.toString();
    assert.doesNotMatch(createSource, /temporaryPassword:\s*input\.temporaryPassword/);
  });

  it("requires temporary password for brand-new users", () => {
    const createSource = companyUserService.create.toString();
    assert.match(createSource, /TEMPORARY_PASSWORD_REQUIRED/);
  });
});
