import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addressSimilarity,
  compareAddresses,
  normalizeAddress,
  normalizeAddressForRangeComparison,
} from "./address";
import { buildGeocodeCacheKey, buildGeocodeQuery } from "./geocoding";
import { reconcileStores } from "./reconcile";
import { normalizeStoreNumber } from "./store-number";
import type { DatabaseStore, OfficialStore } from "./types";
import { MISSING_API_KEY_ERROR_CODE } from "./types";

const baseDatabaseStore = (
  overrides: Partial<DatabaseStore> & Pick<DatabaseStore, "id" | "name" | "address">,
): DatabaseStore => ({
  latitude: -34.6037,
  longitude: -58.3816,
  latitudeRaw: "-34.6037000",
  longitudeRaw: "-58.3816000",
  neighborhood: "",
  locality: "",
  storeFormat: "",
  active: "1",
  googlePlaceId: "",
  createdAt: "",
  updatedAt: "",
  raw: {},
  ...overrides,
});

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

  it("strips store number prefixes and postal codes", () => {
    const normalized = normalizeAddress(
      "6037_Ejército de los Andes 2222_GBA, C1424, Provincia de Buenos Aires",
    );
    assert.match(normalized, /ejercito de los andes 2222/);
    assert.doesNotMatch(normalized, /c1424/);
    assert.doesNotMatch(normalized, /provincia de buenos aires/);
  });

  it("normalizes address ranges to base street numbers", () => {
    assert.equal(normalizeAddressForRangeComparison("Av. Corrientes 4489/91"), "av corrientes 4489");
    assert.equal(normalizeAddressForRangeComparison("Av. Corrientes 2463-65"), "av corrientes 2463");
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

  it("detects likely matches for range-only differences", () => {
    const result = compareAddresses("Av. Corrientes 4489/91", "Avenida Corrientes 4489");
    assert.equal(result.status, "likely_match");
    assert.equal(result.addressDifferenceReason, "range_or_format_difference");
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
    baseDatabaseStore({
      id: "db-557",
      name: "557",
      address: "Avenida Corrientes 1234",
    }),
    baseDatabaseStore({
      id: "db-test",
      name: "prueba-casa",
      address: "Test",
    }),
    baseDatabaseStore({
      id: "db-999",
      name: "999",
      address: "Extra Service",
    }),
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

    assert.equal(result.stats.totalOfficialRows, 2);
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
    assert.equal(matched?.geocodingStatus, "skipped");
    assert.equal(matched?.geocodingErrorCode, MISSING_API_KEY_ERROR_CODE);
    assert.equal(matched?.dbLatitude, "-34.6037000");
    assert.equal(matched?.dbLongitude, "-58.3816000");
  });
});
