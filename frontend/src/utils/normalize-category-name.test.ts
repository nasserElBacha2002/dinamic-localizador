import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCategoryName } from "./normalize-category-name";

describe("normalizeCategoryName", () => {
  it("trims, collapses spaces and lowercases", () => {
    assert.equal(normalizeCategoryName("  Audit   Senior  "), "audit senior");
    assert.equal(normalizeCategoryName("AUDITOR"), "auditor");
  });
});
