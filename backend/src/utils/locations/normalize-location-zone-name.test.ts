import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeLocationZoneDisplayName,
  LOCATION_ZONE_NORMALIZATION_GOLDEN_CASES,
  normalizeLocationZoneLocality,
  normalizeLocationZoneName,
} from "./normalize-location-zone-name";

describe("normalizeLocationZoneName", () => {
  for (const { input, expected } of LOCATION_ZONE_NORMALIZATION_GOLDEN_CASES) {
    it(`normalizes ${JSON.stringify(input)} → ${expected}`, () => {
      assert.equal(normalizeLocationZoneName(input), expected);
    });
  }

  it("normalizes locality the same way", () => {
    assert.equal(normalizeLocationZoneLocality(" CABA "), "caba");
    assert.equal(normalizeLocationZoneLocality(null), "");
    assert.equal(normalizeLocationZoneLocality(undefined), "");
  });

  it("keeps display canonicalization separate from uniqueness key", () => {
    assert.equal(canonicalizeLocationZoneDisplayName("  Caballito  "), "Caballito");
    assert.equal(canonicalizeLocationZoneDisplayName("Núñez"), "Núñez");
  });
});
