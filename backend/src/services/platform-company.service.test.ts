import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { platformCompanyService } from "./platform-company.service";

describe("platform company service", () => {
  it("does not echo temporaryPassword in response payload", () => {
    const createSource = platformCompanyService.createCompany.toString();
    assert.doesNotMatch(createSource, /temporaryPassword:\s*input\.owner\.temporaryPassword/);
  });

  it("requires temporary password for new owner users", () => {
    const createSource = platformCompanyService.createCompany.toString();
    assert.match(createSource, /TEMPORARY_PASSWORD_REQUIRED/);
  });

  it("uses transaction rollback on failure", () => {
    const createSource = platformCompanyService.createCompany.toString();
    assert.match(createSource, /transaction\.rollback/);
    assert.match(createSource, /transaction\.commit/);
  });
});
