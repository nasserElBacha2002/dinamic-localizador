import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeCategoryDisplayName,
  normalizeCategoryName,
} from "./normalize-category-name";

describe("normalizeCategoryName", () => {
  it("trims, collapses spaces and lowercases for uniqueness", () => {
    assert.equal(normalizeCategoryName("  Auxiliar  "), "auxiliar");
    assert.equal(normalizeCategoryName("AUXILIAR"), "auxiliar");
    assert.equal(normalizeCategoryName("Au xi   liar"), "au xi liar");
  });

  it("canonicalizes display name without lowercasing", () => {
    assert.equal(canonicalizeCategoryDisplayName("  Auditor  Interno "), "Auditor Interno");
  });
});
