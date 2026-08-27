import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLocationZoneEditPayload } from "./location-zone-edit-payload";

describe("buildLocationZoneEditPayload", () => {
  it("omits centroids when only name changes", () => {
    const payload = buildLocationZoneEditPayload({
      name: "Boedo",
      locality: "CABA",
      lat: -34.61,
      lng: -58.43,
      initialLat: -34.61,
      initialLng: -58.43,
    });
    assert.equal(payload.name, "Boedo");
    assert.equal("centroidLatitude" in payload, false);
    assert.equal("centroidLongitude" in payload, false);
  });

  it("omits centroids when only locality changes", () => {
    const payload = buildLocationZoneEditPayload({
      name: "Caballito",
      locality: "Ciudad Autónoma de Buenos Aires",
      lat: -34.61,
      lng: -58.43,
      initialLat: -34.61,
      initialLng: -58.43,
    });
    assert.equal("centroidLatitude" in payload, false);
  });

  it("includes centroids when lat/lng change", () => {
    const payload = buildLocationZoneEditPayload({
      name: "Caballito",
      locality: "CABA",
      lat: -34.62,
      lng: -58.44,
      initialLat: -34.61,
      initialLng: -58.43,
    });
    assert.equal(payload.centroidLatitude, -34.62);
    assert.equal(payload.centroidLongitude, -58.44);
  });

  it("includes null/null when both coordinates are cleared", () => {
    const payload = buildLocationZoneEditPayload({
      name: "Caballito",
      locality: "CABA",
      lat: null,
      lng: null,
      initialLat: -34.61,
      initialLng: -58.43,
    });
    assert.equal(payload.centroidLatitude, null);
    assert.equal(payload.centroidLongitude, null);
  });

  it("omits centroids when unchanged nulls stay null", () => {
    const payload = buildLocationZoneEditPayload({
      name: "Caballito",
      locality: "CABA",
      lat: null,
      lng: null,
      initialLat: null,
      initialLng: null,
    });
    assert.equal("centroidLatitude" in payload, false);
  });
});
