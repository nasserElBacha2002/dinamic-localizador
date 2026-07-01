import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePermissionsForRole } from "../constants/company-permissions";

describe("GET /api/companies/:companyId/me contract", () => {
  it("OWNER receives users:manage in effective permissions", () => {
    const permissions = resolvePermissionsForRole("OWNER");
    assert.equal(permissions.has("users:manage"), true);
    assert.equal(permissions.has("employees:read"), true);
  });

  it("READ_ONLY does not receive users:manage", () => {
    const permissions = resolvePermissionsForRole("READ_ONLY");
    assert.equal(permissions.has("users:manage"), false);
  });
});
