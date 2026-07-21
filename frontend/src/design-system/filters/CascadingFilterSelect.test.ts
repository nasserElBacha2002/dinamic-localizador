import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCascadeParentChange } from "./cascading-filter-change";

describe("resolveCascadeParentChange", () => {
  it("returns a single change that clears the child", () => {
    assert.deepEqual(resolveCascadeParentChange("", "CABA"), {
      parentValue: "CABA",
      childValue: "",
    });
    assert.deepEqual(resolveCascadeParentChange("CABA", "GBA"), {
      parentValue: "GBA",
      childValue: "",
    });
  });

  it("does not emit when parent is unchanged", () => {
    assert.equal(resolveCascadeParentChange("CABA", "CABA"), null);
    assert.equal(resolveCascadeParentChange("", ""), null);
  });

  it("clears child when parent is cleared", () => {
    assert.deepEqual(resolveCascadeParentChange("CABA", ""), {
      parentValue: "",
      childValue: "",
    });
  });
});
