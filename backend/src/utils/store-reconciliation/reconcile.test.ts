import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addressSimilarity, compareAddresses, normalizeAddress } from "./address";
import { buildGeocodeCacheKey, buildGeocodeQuery } from "./geocoding";
import { reconcileStores } from "./reconcile";
import { normalizeStoreNumber } from "./store-number";
import type { DatabaseStore, OfficialStore } from "./types";

describe("normalizeStoreNumber", () => {
  it("normalizes numeric store ids as strings", () => {
    assert.equal(normalizeStoreNumber("557"), "557");
    assert.equal(normalizeStoreNumber("0557"), "557");
    assert.equal(normalizeStoreNumber("557.0"), "557");
  });

  it("rejects non-numeric store names", () => {
    assert.equal(normalizeStoreNumber("prueba-casa"), null);
    assert.equal(normalizeStoreNumber("carrefour-formosa"), null);
  });
});

describe("normalizeAddress", () => {
  it("normalizes accents and abbreviations", () => {
    const left = normalizeAddress("Av. Gral. José de San Martín 1200");
    const right = normalizeAddress("Avenida General Jose de San Martin 1200");
    assert.equal(left, right);
  });

  it("matches tucuman and tucumán", () => {
    assert.equal(
      addressSimilarity("San Martin 100, Tucuman", "San Martin 100, Tucumán"),
      1,
    );
  });
});

describe("compareAddresses", () => {
  it("detects exact matches", () => {
    const result = compareAddresses(
      "Av. Corrientes 1234",
      "Avenida Corrientes 1234",
    );
    assert.equal(result.status, "exact_match");
    assert.ok(result.similarity >= 0.99);
  });

  it("detects likely matches for minor formatting differences", () => {
    const result = compareAddresses(
      "Av. San Martin 1872/76 (Villa Carlos Paz)",
      "Avenida San Martin 1872 76 Villa Carlos Paz",
    );
    assert.equal(result.status, "likely_match");
    assert.ok(result.similarity >= 0.85);
  });

  it("detects mismatches", () => {
    const result = compareAddresses("Calle Falsa 123", "Completely Different 999");
    assert.equal(result.status, "mismatch");
  });
});

describe("geocoding helpers", () => {
  it("builds a stable cache key and geocode query", () => {
    const store: OfficialStore = {
      storeNumber: "557",
      rawStoreId: "557",
      officialAddress: "Av. Corrientes 1234",
      neighborhood: "San Nicolas",
      locality: "Buenos Aires",
    };

    assert.equal(
      buildGeocodeQuery(store),
      "Av. Corrientes 1234, San Nicolas, Buenos Aires, Argentina",
    );
    assert.match(buildGeocodeCacheKey(store), /av\. corrientes 1234/);
  });
});

describe("reconcileStores", () => {
  const officialStores: OfficialStore[] = [
    {
      storeNumber: "557",
      rawStoreId: "557",
      officialAddress: "Av. Corrientes 1234",
      neighborhood: "Centro",
      locality: "Buenos Aires",
    },
    {
      storeNumber: "729",
      rawStoreId: "729",
      officialAddress: "Calle Oficial 100",
      neighborhood: "Norte",
      locality: "Cordoba",
    },
  ];

  const databaseStores: DatabaseStore[] = [
    {
      id: "db-557",
      name: "557",
      address: "Avenida Corrientes 1234",
      latitude: -34.6,
      longitude: -58.38,
      neighborhood: "",
      locality: "",
      storeFormat: "",
      active: "1",
      raw: {},
    },
    {
      id: "db-test",
      name: "prueba-casa",
      address: "Test",
      latitude: -34.6,
      longitude: -58.38,
      neighborhood: "",
      locality: "",
      storeFormat: "",
      active: "1",
      raw: {},
    },
    {
      id: "db-999",
      name: "999",
      address: "Extra Store",
      latitude: -34.6,
      longitude: -58.38,
      neighborhood: "",
      locality: "",
      storeFormat: "",
      active: "1",
      raw: {},
    },
  ];

  it("identifies missing, extra and ignored rows without geocoding", async () => {
    const result = await reconcileStores(
      officialStores,
      databaseStores,
      {
        likelyMatchThreshold: 0.85,
        coordinateOkMeters: 100,
        coordinateReviewMeters: 300,
        geocodingEnabled: false,
        geocodeDelayMs: 0,
      },
      {},
      "/tmp/geocode-cache.json",
      null,
    );

    assert.equal(result.stats.totalOfficialStores, 2);
    assert.equal(result.stats.numericDatabaseStores, 2);
    assert.equal(result.stats.ignoredNonNumericDatabaseRows, 1);
    assert.equal(result.stats.missingInDatabase, 1);
    assert.equal(result.stats.extraInDatabase, 1);
    assert.equal(result.missingInDatabase[0]?.storeNumber, "729");
    assert.equal(result.extraInDatabase[0]?.storeNumber, "999");

    const matched = result.summary.find((row) => row.storeNumber === "557");
    assert.ok(matched);
    assert.equal(matched?.addressMatchStatus, "exact_match");
    assert.equal(matched?.coordinateStatus, "geocoding_skipped");
  });
});
