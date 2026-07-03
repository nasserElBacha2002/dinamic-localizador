import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeLocationTypeCode } from "./location-type-code";

describe("normalizeLocationTypeCode", () => {
  it("normalizes names into uppercase codes", () => {
    assert.equal(normalizeLocationTypeCode("Express Interior"), "EXPRESS_INTERIOR");
  });

  it("returns TYPE for empty values", () => {
    assert.equal(normalizeLocationTypeCode("   "), "TYPE");
  });
});
