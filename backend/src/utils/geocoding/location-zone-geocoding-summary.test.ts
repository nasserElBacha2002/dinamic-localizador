import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGeocodingCoverageSummary,
  summarizeCanonicalLocalities,
} from "./location-zone-geocoding-summary";

describe("buildGeocodingCoverageSummary", () => {
  it("computes coverage over active-zone counts and ignores inactive by construction", () => {
    const summary = buildGeocodingCoverageSummary({
      total: 28,
      resolved: 18,
      manual: 5,
      pending: 3,
      failed: 2,
      withCoordinates: 23,
      withoutCoordinates: 5,
    });
    assert.equal(summary.coveragePercent, 82);
    assert.equal(summary.withCoordinates, 23);
    assert.equal(summary.pending, 3);
    assert.equal(summary.failed, 2);
  });

  it("returns 0% when there are no active zones", () => {
    const summary = buildGeocodingCoverageSummary({
      total: 0,
      resolved: 0,
      manual: 0,
      pending: 0,
      failed: 0,
      withCoordinates: 0,
      withoutCoordinates: 0,
    });
    assert.equal(summary.coveragePercent, 0);
  });

  it("treats RESOLVED+MANUAL as coverage contributors via withCoordinates", () => {
    const summary = buildGeocodingCoverageSummary({
      total: 4,
      resolved: 2,
      manual: 1,
      pending: 1,
      failed: 0,
      withCoordinates: 3,
      withoutCoordinates: 1,
    });
    assert.equal(summary.coveragePercent, 75);
  });
});

describe("summarizeCanonicalLocalities", () => {
  it("separates canonicalized, missing and unknown without inventing codes", () => {
    const summary = summarizeCanonicalLocalities([
      "CABA",
      "Capital",
      "GBA",
      "Córdoba",
      null,
      "",
      "Castelar",
    ]);
    assert.equal(summary.canonicalized, 4);
    assert.equal(summary.missingLocality, 2);
    assert.equal(summary.unknownLocality, 1);
  });
});
