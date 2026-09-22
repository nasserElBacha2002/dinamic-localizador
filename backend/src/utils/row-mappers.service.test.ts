import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapServiceRow } from "./row-mappers";

describe("mapServiceRow", () => {
  it("maps the nullable database client_id to clientId", () => {
    const row = {
      id: "service-1",
      name: "Sucursal",
      address: null,
      neighborhood: null,
      locality: null,
      location_zone_id: null,
      store_format: null,
      latitude: -34.6,
      longitude: -58.38,
      allowed_radius_meters: 150,
      google_place_id: null,
      active: true,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
      client_id: "client-1",
    };

    assert.equal(mapServiceRow(row).clientId, "client-1");
    assert.equal(mapServiceRow({ ...row, client_id: null }).clientId, null);
  });
});
