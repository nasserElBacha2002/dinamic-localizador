import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLocationZoneGeocodingQuery,
  expandLocalityForGeocoding,
  isWithinArgentinaBounds,
  selectCompatibleGeocodeCandidate,
  validateGeocodeAgainstLocality,
} from "./location-zone-query";
import { resolveCanonicalLocality } from "./canonical-locality";
import type { GeocodeSuccess } from "./google-geocode";

describe("expandLocalityForGeocoding", () => {
  it("expands CABA and Capital to Ciudad Autónoma de Buenos Aires", () => {
    assert.equal(expandLocalityForGeocoding("CABA"), "Ciudad Autónoma de Buenos Aires");
    assert.equal(expandLocalityForGeocoding("Capital"), "Ciudad Autónoma de Buenos Aires");
    assert.equal(
      expandLocalityForGeocoding("Ciudad Autónoma de Buenos Aires"),
      "Ciudad Autónoma de Buenos Aires",
    );
  });

  it("expands GBA to Buenos Aires without inventing a municipality", () => {
    assert.equal(expandLocalityForGeocoding("GBA"), "Buenos Aires");
  });

  it("keeps Córdoba, Salta and Mendoza labels usable", () => {
    assert.equal(expandLocalityForGeocoding("Córdoba"), "Córdoba");
    assert.equal(expandLocalityForGeocoding("cordoba"), "Córdoba");
    assert.equal(expandLocalityForGeocoding("Salta"), "Salta");
    assert.equal(expandLocalityForGeocoding("Mendoza"), "Mendoza");
  });

  it("preserves Castelar as-is (unknown municipality label)", () => {
    assert.equal(expandLocalityForGeocoding("Castelar"), "Castelar");
    assert.equal(resolveCanonicalLocality("Castelar").status, "UNKNOWN");
  });
});

describe("buildLocationZoneGeocodingQuery", () => {
  it("builds expected queries for Argentine zones", () => {
    assert.equal(
      buildLocationZoneGeocodingQuery({ name: "Caballito", locality: "CABA" }),
      "Caballito, Ciudad Autónoma de Buenos Aires, Argentina",
    );
    assert.equal(
      buildLocationZoneGeocodingQuery({ name: "Bernal", locality: "GBA" }),
      "Bernal, Buenos Aires, Argentina",
    );
    assert.equal(
      buildLocationZoneGeocodingQuery({ name: "Nueva Córdoba", locality: "Córdoba" }),
      "Nueva Córdoba, Córdoba, Argentina",
    );
    assert.equal(
      buildLocationZoneGeocodingQuery({ name: "Centro", locality: "Mendoza" }),
      "Centro, Mendoza, Argentina",
    );
  });

  it("disambiguates Centro across CABA / Córdoba / Salta / Mendoza", () => {
    const caba = buildLocationZoneGeocodingQuery({ name: "Centro", locality: "CABA" });
    const capital = buildLocationZoneGeocodingQuery({ name: "Centro", locality: "Capital" });
    const cordoba = buildLocationZoneGeocodingQuery({ name: "Centro", locality: "Córdoba" });
    const salta = buildLocationZoneGeocodingQuery({ name: "Centro", locality: "Salta" });
    const mendoza = buildLocationZoneGeocodingQuery({ name: "Centro", locality: "Mendoza" });

    assert.equal(caba, capital);
    assert.notEqual(caba, cordoba);
    assert.notEqual(caba, salta);
    assert.notEqual(caba, mendoza);
    assert.notEqual(cordoba, salta);
    assert.equal(resolveCanonicalLocality("CABA").code, "AR-CABA");
    assert.equal(resolveCanonicalLocality("Córdoba").code, "AR-X-CORDOBA");
    assert.equal(resolveCanonicalLocality("Salta").code, "AR-A-SALTA");
    assert.equal(resolveCanonicalLocality("Mendoza").code, "AR-M-MENDOZA");
  });
});

describe("isWithinArgentinaBounds", () => {
  it("accepts Caballito-ish coordinates and rejects foreign ones", () => {
    assert.equal(isWithinArgentinaBounds(-34.62, -58.44), true);
    assert.equal(isWithinArgentinaBounds(40.71, -74.0), false);
  });
});

describe("validateGeocodeAgainstLocality", () => {
  const success = (
    overrides: Partial<{
      formattedAddress: string;
      addressComponents: Array<{ longName: string; shortName: string; types: string[] }>;
    }> = {},
  ): GeocodeSuccess => ({
    status: "OK",
    query: "q",
    latitude: -34.6,
    longitude: -58.4,
    countryCode: "AR",
    formattedAddress: overrides.formattedAddress ?? "Centro, Córdoba, Argentina",
    addressComponents: overrides.addressComponents ?? [
      { longName: "Córdoba", shortName: "X", types: ["administrative_area_level_1"] },
      { longName: "Argentina", shortName: "AR", types: ["country"] },
    ],
  });

  it("accepts Córdoba result for Centro/Córdoba and rejects CABA-looking result", () => {
    const ok = validateGeocodeAgainstLocality(success(), "Córdoba");
    assert.equal(ok.status, "OK");

    const rejected = validateGeocodeAgainstLocality(
      success({
        formattedAddress: "Centro, Ciudad Autónoma de Buenos Aires, Argentina",
        addressComponents: [
          {
            longName: "Ciudad Autónoma de Buenos Aires",
            shortName: "CABA",
            types: ["administrative_area_level_1"],
          },
        ],
      }),
      "Córdoba",
    );
    assert.equal(rejected.status, "REJECTED_REGION");
  });

  it("distinguishes Salta from Córdoba and validates Mendoza", () => {
    const salta = validateGeocodeAgainstLocality(
      success({
        formattedAddress: "Centro, Salta, Argentina",
        addressComponents: [
          { longName: "Salta", shortName: "A", types: ["administrative_area_level_1"] },
        ],
      }),
      "Salta",
    );
    assert.equal(salta.status, "OK");

    const wrong = validateGeocodeAgainstLocality(success(), "Salta");
    assert.equal(wrong.status, "REJECTED_REGION");

    const mendoza = validateGeocodeAgainstLocality(
      success({
        formattedAddress: "Centro, Mendoza, Argentina",
        addressComponents: [
          { longName: "Mendoza", shortName: "M", types: ["administrative_area_level_1"] },
        ],
      }),
      "Mendoza",
    );
    assert.equal(mendoza.status, "OK");
  });

  it("accepts Provincia Buenos Aires for GBA and rejects other provinces", () => {
    const ok = validateGeocodeAgainstLocality(
      success({
        formattedAddress: "Bernal, Buenos Aires, Argentina",
        addressComponents: [
          { longName: "Buenos Aires", shortName: "B", types: ["administrative_area_level_1"] },
        ],
      }),
      "GBA",
    );
    assert.equal(ok.status, "OK");

    for (const [name, locality] of [
      ["Merlo", "GBA"],
      ["Tigre", "GBA"],
      ["La Plata", "Buenos Aires"],
    ] as const) {
      const accepted = validateGeocodeAgainstLocality(
        success({
          formattedAddress: `${name}, Buenos Aires, Argentina`,
          addressComponents: [
            { longName: "Buenos Aires", shortName: "B", types: ["administrative_area_level_1"] },
          ],
        }),
        locality,
      );
      assert.equal(accepted.status, "OK", `${name}/${locality}`);
    }

    const cordoba = validateGeocodeAgainstLocality(
      success({
        formattedAddress: "Bernal, Córdoba, Argentina",
        addressComponents: [
          { longName: "Córdoba", shortName: "X", types: ["administrative_area_level_1"] },
        ],
      }),
      "GBA",
    );
    assert.equal(cordoba.status, "REJECTED_REGION");

    const santaFe = validateGeocodeAgainstLocality(
      success({
        formattedAddress: "Tigre, Santa Fe, Argentina",
        addressComponents: [
          { longName: "Santa Fe", shortName: "S", types: ["administrative_area_level_1"] },
        ],
      }),
      "GBA",
    );
    assert.equal(santaFe.status, "REJECTED_REGION");

    const caba = validateGeocodeAgainstLocality(
      success({
        formattedAddress: "Bernal, CABA",
        addressComponents: [
          {
            longName: "Ciudad Autónoma de Buenos Aires",
            shortName: "CABA",
            types: ["administrative_area_level_1"],
          },
        ],
      }),
      "GBA",
    );
    assert.equal(caba.status, "REJECTED_REGION");
  });
});

describe("selectCompatibleGeocodeCandidate", () => {
  it("skips wrong-region first result and picks a compatible later candidate", () => {
    const wrong: GeocodeSuccess = {
      status: "OK",
      query: "Centro, Córdoba, Argentina",
      latitude: -34.6,
      longitude: -58.4,
      countryCode: "AR",
      formattedAddress: "Centro, CABA",
      addressComponents: [
        {
          longName: "Ciudad Autónoma de Buenos Aires",
          shortName: "CABA",
          types: ["administrative_area_level_1"],
        },
      ],
    };
    const right: GeocodeSuccess = {
      status: "OK",
      query: "Centro, Córdoba, Argentina",
      latitude: -31.4,
      longitude: -64.2,
      countryCode: "AR",
      formattedAddress: "Centro, Córdoba",
      addressComponents: [
        { longName: "Córdoba", shortName: "X", types: ["administrative_area_level_1"] },
      ],
    };

    const selected = selectCompatibleGeocodeCandidate([wrong, right], "Córdoba");
    assert.equal(selected.status, "OK");
    if (selected.status === "OK") {
      assert.equal(selected.latitude, -31.4);
    }
  });

  it("rejects when no candidate matches strong region", () => {
    const onlyWrong: GeocodeSuccess = {
      status: "OK",
      query: "Centro, Salta, Argentina",
      latitude: -31.4,
      longitude: -64.2,
      countryCode: "AR",
      formattedAddress: "Centro, Córdoba",
      addressComponents: [
        { longName: "Córdoba", shortName: "X", types: ["administrative_area_level_1"] },
      ],
    };
    const selected = selectCompatibleGeocodeCandidate([onlyWrong], "Salta");
    assert.equal(selected.status, "REJECTED_REGION");
  });
});
