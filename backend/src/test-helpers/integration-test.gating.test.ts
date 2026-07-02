import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDatabaseIntegrationEnabled } from "./integration-test";

describe("database integration gating", () => {
  const originalFlag = process.env.RUN_DB_INTEGRATION_TESTS;

  it("is disabled unless RUN_DB_INTEGRATION_TESTS=true", () => {
    delete process.env.RUN_DB_INTEGRATION_TESTS;
    assert.equal(isDatabaseIntegrationEnabled(), false);

    process.env.RUN_DB_INTEGRATION_TESTS = "true";
    assert.equal(isDatabaseIntegrationEnabled(), true);
  });

  it("restores RUN_DB_INTEGRATION_TESTS", () => {
    if (originalFlag === undefined) {
      delete process.env.RUN_DB_INTEGRATION_TESTS;
      return;
    }

    process.env.RUN_DB_INTEGRATION_TESTS = originalFlag;
  });
});
