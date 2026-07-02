import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("company users frontend module", () => {
  it("uses scoped API client for company users module", () => {
    const apiFile = readFileSync(
      join(process.cwd(), "src/api/company-users.api.ts"),
      "utf8",
    );
    assert.match(apiFile, /scopedApiClient/);
    assert.doesNotMatch(apiFile, /apiClient\.(get|post|patch|delete)\(\s*["'`]users/);
  });

  it("gates company users query with operational enabled hook", () => {
    const hooksFile = readFileSync(
      join(process.cwd(), "src/hooks/useCompanyUsers.ts"),
      "utf8",
    );
    assert.match(hooksFile, /useOperationalQueryEnabled/);
    assert.match(hooksFile, /company-users", companyId/);
  });
});
