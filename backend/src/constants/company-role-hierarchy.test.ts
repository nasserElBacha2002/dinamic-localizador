import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPANY_ROLE_RANK,
  canAssignCompanyRole,
  isStrictlySuperiorRole,
  listAssignableCompanyRoles,
} from "./company-role-hierarchy";

describe("company-role-hierarchy", () => {
  it("defines a total order for every company role", () => {
    assert.equal(COMPANY_ROLE_RANK.OWNER > COMPANY_ROLE_RANK.ADMIN, true);
    assert.equal(COMPANY_ROLE_RANK.ADMIN > COMPANY_ROLE_RANK.HR, true);
    assert.equal(COMPANY_ROLE_RANK.HR > COMPANY_ROLE_RANK.SUPERVISOR, true);
    assert.equal(COMPANY_ROLE_RANK.SUPERVISOR > COMPANY_ROLE_RANK.OPERATOR, true);
    assert.equal(COMPANY_ROLE_RANK.OPERATOR > COMPANY_ROLE_RANK.READ_ONLY, true);
  });

  it("requires strictly superior rank to manage another role", () => {
    assert.equal(isStrictlySuperiorRole("OWNER", "ADMIN"), true);
    assert.equal(isStrictlySuperiorRole("OWNER", "OWNER"), false);
    assert.equal(isStrictlySuperiorRole("ADMIN", "OWNER"), false);
    assert.equal(isStrictlySuperiorRole("ADMIN", "ADMIN"), false);
  });

  it("allows assigning only strictly lower roles", () => {
    assert.equal(canAssignCompanyRole("OWNER", "ADMIN", false), true);
    assert.equal(canAssignCompanyRole("OWNER", "OWNER", false), false);
    assert.equal(canAssignCompanyRole("ADMIN", "HR", false), true);
    assert.equal(canAssignCompanyRole("ADMIN", "OWNER", false), false);
    assert.equal(canAssignCompanyRole(undefined, "READ_ONLY", false), false);
    assert.equal(canAssignCompanyRole("ADMIN", "OWNER", true), true);
  });

  it("lists assignable roles below the actor", () => {
    assert.deepEqual(listAssignableCompanyRoles("OWNER", false), [
      "ADMIN",
      "HR",
      "SUPERVISOR",
      "OPERATOR",
      "READ_ONLY",
    ]);
    assert.deepEqual(listAssignableCompanyRoles("ADMIN", false), [
      "HR",
      "SUPERVISOR",
      "OPERATOR",
      "READ_ONLY",
    ]);
  });
});
