import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LocationZone } from "../types/location-zone";
import {
  filterZonesByGeocodingStatus,
  geocodingStatusLabel,
  summarizeActiveZoneGeocoding,
} from "./location-zone-geocoding-ui";

const zone = (
  overrides: Partial<LocationZone> & Pick<LocationZone, "id" | "name" | "geocodingStatus">,
): LocationZone => ({
  companyId: "c1",
  normalizedName: overrides.name.toLowerCase(),
  locality: "CABA",
  normalizedLocality: "caba",
  centroidLatitude: null,
  centroidLongitude: null,
  geocodingSource: null,
  geocodedAt: null,
  geocodingLastError: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("location-zone-geocoding-ui", () => {
  it("exposes accessible text labels for each status", () => {
    assert.equal(geocodingStatusLabel("RESOLVED"), "Resuelta");
    assert.equal(geocodingStatusLabel("MANUAL"), "Manual");
    assert.equal(geocodingStatusLabel("PENDING"), "Pendiente");
    assert.equal(geocodingStatusLabel("FAILED"), "Error");
  });

  it("filters by geocoding status including null", () => {
    const zones = [
      zone({ id: "1", name: "A", geocodingStatus: "RESOLVED" }),
      zone({ id: "2", name: "B", geocodingStatus: "FAILED" }),
      zone({ id: "3", name: "C", geocodingStatus: null }),
    ];
    assert.equal(filterZonesByGeocodingStatus(zones, "FAILED").length, 1);
    assert.equal(filterZonesByGeocodingStatus(zones, "NONE")[0]?.id, "3");
    assert.equal(filterZonesByGeocodingStatus(zones, "ALL").length, 3);
  });

  it("summarizes active zones and excludes inactive from coverage", () => {
    const zones = [
      zone({
        id: "1",
        name: "A",
        geocodingStatus: "RESOLVED",
        centroidLatitude: -34.6,
        centroidLongitude: -58.4,
      }),
      zone({
        id: "2",
        name: "B",
        geocodingStatus: "MANUAL",
        centroidLatitude: -34.5,
        centroidLongitude: -58.5,
      }),
      zone({ id: "3", name: "C", geocodingStatus: "PENDING" }),
      zone({ id: "4", name: "D", geocodingStatus: "FAILED" }),
      zone({
        id: "5",
        name: "E",
        geocodingStatus: "RESOLVED",
        isActive: false,
        centroidLatitude: -34.1,
        centroidLongitude: -58.1,
      }),
    ];

    const summary = summarizeActiveZoneGeocoding(zones);
    assert.equal(summary.total, 4);
    assert.equal(summary.resolved, 1);
    assert.equal(summary.manual, 1);
    assert.equal(summary.pending, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.withCoordinates, 2);
    assert.equal(summary.coveragePercent, 50);
    // Canonical metrics are backend-only; client fallback leaves them at 0.
    assert.equal(summary.canonicalized, 0);
    assert.equal(summary.missingLocality, 0);
    assert.equal(summary.unknownLocality, 0);
  });
});
