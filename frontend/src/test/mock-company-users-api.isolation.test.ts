import { mock } from "node:test";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockRoleCapabilitiesApi } from "./mock-company-users-api";

const getRoleCapabilitiesMock = mock.fn(async () => ({
  role: "ADMIN",
  name: "Administrador",
  description: "x",
  isSystemRole: true,
  permissions: [],
  restrictions: [],
}));

mockRoleCapabilitiesApi({
  getRoleCapabilities: getRoleCapabilitiesMock,
});

describe("mockRoleCapabilitiesApi isolation", () => {
  it("intercepts getRoleCapabilities before the real axios client runs", async () => {
    const api = await import("../api/role-capabilities.api");
    const result = await api.getRoleCapabilities("co-1", "ADMIN");
    assert.equal(result.name, "Administrador");
    assert.equal(getRoleCapabilitiesMock.mock.calls.length, 1);
  });
});
