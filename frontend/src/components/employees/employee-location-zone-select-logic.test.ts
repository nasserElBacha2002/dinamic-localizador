import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldOfferLocationZoneCreate } from "./employee-location-zone-select-logic";

describe("shouldOfferLocationZoneCreate", () => {
  it("offers create when input does not match existing zone names", () => {
    assert.equal(
      shouldOfferLocationZoneCreate({
        input: "Villa del Parque",
        zoneLabels: ["Caballito", "Palermo"],
        canCreate: true,
        catalogReady: true,
        createPending: false,
      }),
      true,
    );
  });

  it("does not offer create for case/whitespace duplicates", () => {
    assert.equal(
      shouldOfferLocationZoneCreate({
        input: "  CABALLITO ",
        zoneLabels: ["Caballito"],
        canCreate: true,
        catalogReady: true,
        createPending: false,
      }),
      false,
    );
  });
});
