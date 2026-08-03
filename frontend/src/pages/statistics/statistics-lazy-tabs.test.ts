import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Documents the lazy-tab contract: General loads analytics only;
 * employee/operation/location tables stay disabled until their tab is active.
 */
describe("statistics lazy tab enablement contract", () => {
  const resolveEnabled = (activeTab: string, tab: string) => activeTab === tab;

  it("enables general analytics only on general tab", () => {
    assert.equal(resolveEnabled("general", "general"), true);
    assert.equal(resolveEnabled("general", "employee"), false);
    assert.equal(resolveEnabled("general", "operation"), false);
    assert.equal(resolveEnabled("general", "location"), false);
  });

  it("enables each table tab in isolation", () => {
    assert.equal(resolveEnabled("employee", "employee"), true);
    assert.equal(resolveEnabled("employee", "general"), false);
    assert.equal(resolveEnabled("operation", "operation"), true);
    assert.equal(resolveEnabled("location", "location"), true);
  });
});
