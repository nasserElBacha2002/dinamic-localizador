import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import { buildOperationAdminUrl } from "./operation-admin-url";

describe("buildOperationAdminUrl", () => {
  it("builds operation path with optional query context", () => {
    setupUnitTestEnv();
    const url = buildOperationAdminUrl("op-1", {
      workDate: "2026-11-17",
      employeeWorkdayId: "ew-1",
    });
    assert.match(url, /\/operations\/op-1\?/);
    assert.match(url, /workDate=2026-11-17/);
    assert.match(url, /employeeWorkdayId=ew-1/);
  });
});