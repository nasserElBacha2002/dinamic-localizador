import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { locationZoneRepository } from "../repositories/location-zone.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import type { LocationZone } from "../types/location-zone";
import { locationZoneGeocodingService } from "./location-zone-geocoding.service";

setupUnitTestEnv();

const baseZone = (overrides: Partial<LocationZone> = {}): LocationZone => ({
  id: "zone-1",
  companyId: "company-a",
  name: "Caballito",
  normalizedName: "caballito",
  locality: "CABA",
  normalizedLocality: "caba",
  centroidLatitude: null,
  centroidLongitude: null,
  geocodingStatus: "PENDING",
  geocodingSource: null,
  geocodedAt: null,
  geocodingLastError: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const mockGoogleOk = (
  lat: number,
  lng: number,
  extras: {
    country?: string;
    formattedAddress?: string;
    components?: Array<{ long_name: string; short_name: string; types: string[] }>;
  } = {},
) => {
  mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({
        status: "OK",
        results: [
          {
            formatted_address: extras.formattedAddress ?? "ok",
            address_components: extras.components ?? [
              { long_name: "Argentina", short_name: extras.country ?? "AR", types: ["country"] },
              {
                long_name: "Ciudad Autónoma de Buenos Aires",
                short_name: "CABA",
                types: ["administrative_area_level_1"],
              },
            ],
            geometry: { location: { lat, lng } },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
};

const mockGoogleStatus = (status: string) => {
  mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ status, results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
};

describe("locationZoneGeocodingService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("resolves PENDING → RESOLVED on provider success", async () => {
    mockGoogleOk(-34.62, -58.44);
    mock.method(locationZoneRepository, "applyGeocodeResult", async () =>
      baseZone({
        centroidLatitude: -34.62,
        centroidLongitude: -58.44,
        geocodingStatus: "RESOLVED",
        geocodingSource: "AUTO",
      }),
    );

    const result = await locationZoneGeocodingService.geocodeZone(baseZone(), {
      apiKey: "test-key",
    });
    assert.equal(result.outcome, "RESOLVED");
  });

  it("marks FAILED on ZERO_RESULTS without inventing coordinates", async () => {
    mockGoogleStatus("ZERO_RESULTS");
    mock.method(locationZoneRepository, "applyGeocodeResult", async (_zoneId, write) => {
      assert.equal(write.geocodingStatus, "FAILED");
      assert.equal(write.centroidLatitude, null);
      return baseZone({ geocodingStatus: "FAILED", geocodingLastError: write.geocodingLastError });
    });

    const result = await locationZoneGeocodingService.geocodeZone(
      baseZone({ name: "Centro", locality: "Córdoba", normalizedLocality: "cordoba" }),
      { apiKey: "test-key" },
    );
    assert.equal(result.outcome, "FAILED");
  });

  it("rejects coordinates outside Argentina bounds", async () => {
    mockGoogleOk(40.7, -74.0, { country: "US", formattedAddress: "NY", components: [] });
    mock.method(locationZoneRepository, "applyGeocodeResult", async (_zoneId, write) => {
      assert.equal(write.geocodingStatus, "FAILED");
      return baseZone({ geocodingStatus: "FAILED" });
    });

    const result = await locationZoneGeocodingService.geocodeZone(baseZone(), {
      apiKey: "test-key",
    });
    assert.equal(result.outcome, "FAILED");
  });

  it("skips MANUAL overrides", async () => {
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      throw new Error("should not call provider");
    });

    const result = await locationZoneGeocodingService.geocodeZone(
      baseZone({
        geocodingStatus: "MANUAL",
        geocodingSource: "MANUAL",
        centroidLatitude: -34.6,
        centroidLongitude: -58.4,
      }),
      { apiKey: "test-key" },
    );
    assert.equal(result.outcome, "SKIPPED_MANUAL");
    assert.equal(fetchCalls, 0);
  });

  it("skips already RESOLVED AUTO zones", async () => {
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      throw new Error("should not call provider");
    });

    const result = await locationZoneGeocodingService.geocodeZone(
      baseZone({
        geocodingStatus: "RESOLVED",
        geocodingSource: "AUTO",
        centroidLatitude: -34.62,
        centroidLongitude: -58.44,
      }),
      { apiKey: "test-key" },
    );
    assert.equal(result.outcome, "SKIPPED_ALREADY_RESOLVED");
    assert.equal(fetchCalls, 0);
  });

  it("force re-geocode can replace MANUAL only via applyGeocodeResult with override", async () => {
    mockGoogleOk(-34.61, -58.43);
    let sawAllowManual = false;
    let sawExpectedUpdatedAt: string | undefined;
    mock.method(locationZoneRepository, "applyGeocodeResult", async (_zoneId, write, expected) => {
      sawAllowManual = Boolean(expected.allowManualOverride);
      sawExpectedUpdatedAt = String(expected.expectedUpdatedAt);
      assert.equal(write.geocodingStatus, "RESOLVED");
      assert.equal(write.geocodingSource, "AUTO");
      return baseZone({
        centroidLatitude: -34.61,
        centroidLongitude: -58.43,
        geocodingStatus: "RESOLVED",
        geocodingSource: "AUTO",
      });
    });
    mock.method(locationZoneRepository, "updateGlobal", async () => {
      throw new Error("force must not use generic updateGlobal()");
    });

    const zone = baseZone({
      geocodingStatus: "MANUAL",
      geocodingSource: "MANUAL",
      centroidLatitude: -34.5,
      centroidLongitude: -58.5,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const result = await locationZoneGeocodingService.geocodeZone(zone, {
      apiKey: "test-key",
      force: true,
    });
    assert.equal(result.outcome, "RESOLVED");
    assert.equal(sawAllowManual, true);
    assert.equal(sawExpectedUpdatedAt, zone.updatedAt);
  });

  it("force success with stale updated_at returns SKIPPED_STALE_INPUT", async () => {
    mockGoogleOk(-34.62, -58.44);
    mock.method(locationZoneRepository, "applyGeocodeResult", async () => null);
    mock.method(locationZoneRepository, "findByIdForCompany", async () =>
      baseZone({
        name: "Boedo",
        normalizedName: "boedo",
        locality: "CABA",
        normalizedLocality: "caba",
        geocodingStatus: "MANUAL",
        geocodingSource: "MANUAL",
        centroidLatitude: -34.7,
        centroidLongitude: -58.5,
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    );

    const result = await locationZoneGeocodingService.geocodeZone(
      baseZone({
        name: "Boedo",
        normalizedName: "boedo",
        locality: "CABA",
        normalizedLocality: "caba",
        geocodingStatus: "MANUAL",
        geocodingSource: "MANUAL",
        centroidLatitude: -34.5,
        centroidLongitude: -58.5,
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
      { apiKey: "test-key", force: true },
    );
    assert.equal(result.outcome, "SKIPPED_STALE_INPUT");
  });

  it("force failure preserves MANUAL and does not persist FAILED wipe", async () => {
    mockGoogleStatus("ZERO_RESULTS");
    let persistCalls = 0;
    mock.method(locationZoneRepository, "applyGeocodeResult", async () => {
      persistCalls += 1;
      return null;
    });
    mock.method(locationZoneRepository, "updateGlobal", async () => {
      throw new Error("force failure must not use generic updateGlobal()");
    });

    const result = await locationZoneGeocodingService.geocodeZone(
      baseZone({
        geocodingStatus: "MANUAL",
        geocodingSource: "MANUAL",
        centroidLatitude: -34.5,
        centroidLongitude: -58.5,
      }),
      { apiKey: "test-key", force: true },
    );
    assert.equal(result.outcome, "FAILED");
    assert.equal(persistCalls, 0);
  });

  it("force success with 0-row conditional write returns SKIPPED_STALE_INPUT not RESOLVED", async () => {
    mockGoogleOk(-34.62, -58.44);
    mock.method(locationZoneRepository, "applyGeocodeResult", async () => null);
    mock.method(locationZoneRepository, "findByIdForCompany", async () =>
      baseZone({
        name: "Caballito",
        normalizedName: "caballito",
        locality: "CABA",
        normalizedLocality: "caba",
        geocodingStatus: "MANUAL",
        geocodingSource: "MANUAL",
        centroidLatitude: -34.5,
        centroidLongitude: -58.5,
      }),
    );

    const result = await locationZoneGeocodingService.geocodeZone(
      baseZone({
        name: "Boedo",
        normalizedName: "boedo",
        geocodingStatus: "MANUAL",
        geocodingSource: "MANUAL",
        centroidLatitude: -34.5,
        centroidLongitude: -58.5,
      }),
      { apiKey: "test-key", force: true },
    );
    assert.equal(result.outcome, "SKIPPED_STALE_INPUT");
  });

  it("skips stale normalized key writes", async () => {
    mockGoogleOk(-34.62, -58.44);
    mock.method(locationZoneRepository, "applyGeocodeResult", async () => null);
    mock.method(locationZoneRepository, "findByIdForCompany", async () =>
      baseZone({
        name: "Boedo",
        normalizedName: "boedo",
        locality: "CABA",
        normalizedLocality: "caba",
      }),
    );

    const result = await locationZoneGeocodingService.geocodeZone(baseZone(), {
      apiKey: "test-key",
    });
    assert.equal(result.outcome, "SKIPPED_STALE_INPUT");
  });

  it("skips concurrent MANUAL after Google responds", async () => {
    mockGoogleOk(-34.62, -58.44);
    mock.method(locationZoneRepository, "applyGeocodeResult", async () => null);
    mock.method(locationZoneRepository, "findByIdForCompany", async () =>
      baseZone({
        geocodingStatus: "MANUAL",
        geocodingSource: "MANUAL",
        centroidLatitude: -34.5,
        centroidLongitude: -58.5,
      }),
    );

    const result = await locationZoneGeocodingService.geocodeZone(baseZone(), {
      apiKey: "test-key",
    });
    assert.equal(result.outcome, "SKIPPED_CONCURRENT_MANUAL");
  });

  it("continues backfill when one zone throws", async () => {
    const zones = [
      baseZone({ id: "a", name: "A", normalizedName: "a" }),
      baseZone({ id: "b", name: "B", normalizedName: "b" }),
      baseZone({ id: "c", name: "C", normalizedName: "c" }),
    ];
    mock.method(locationZoneRepository, "listEligibleForGeocoding", async () => zones);

    let calls = 0;
    mock.method(locationZoneGeocodingService, "geocodeZone", async (zone: LocationZone) => {
      calls += 1;
      if (zone.id === "b") {
        throw new Error("repository exploded");
      }
      return {
        zoneId: zone.id,
        companyId: zone.companyId,
        query: "q",
        outcome: "RESOLVED" as const,
      };
    });

    const summary = await locationZoneGeocodingService.backfill({ delayMs: 0 });
    assert.equal(calls, 3);
    assert.equal(summary.resolved, 2);
    assert.equal(summary.failed, 1);
  });
});
