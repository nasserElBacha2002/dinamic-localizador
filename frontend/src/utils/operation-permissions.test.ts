import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canManageOperationStructure,
  canManageOperationTeams,
} from "./operation-permissions";

describe("operation permissions", () => {
  it("structure manage is exclusive to operations:manage", () => {
    assert.equal(canManageOperationStructure(["operations:manage"]), true);
    assert.equal(canManageOperationStructure(["operations:teams:manage"]), false);
  });

  it("team manage accepts operations:manage or operations:teams:manage", () => {
    assert.equal(canManageOperationTeams(["operations:manage"]), true);
    assert.equal(canManageOperationTeams(["operations:teams:manage"]), true);
    assert.equal(canManageOperationTeams(["operations:read"]), false);
  });
});
