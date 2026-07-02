import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { companyContextService } from "./company-context.service";
import { roleHasPermission } from "../constants/company-permissions";

describe("company context service (unit)", () => {
  it("exposes legacy multi-company error semantics via resolveLegacyCompanyContext", async () => {
    const resolveLegacy = companyContextService.resolveLegacyCompanyContext.toString();
    assert.match(resolveLegacy, /COMPANY_SELECTION_REQUIRED/);
  });
});

describe("company permissions for settings", () => {
  it("allows OWNER and ADMIN to update settings", () => {
    assert.equal(roleHasPermission("OWNER", "company:settings:update"), true);
    assert.equal(roleHasPermission("ADMIN", "company:settings:update"), true);
  });

  it("denies READ_ONLY settings updates", () => {
    assert.equal(roleHasPermission("READ_ONLY", "company:settings:update"), false);
  });
});
