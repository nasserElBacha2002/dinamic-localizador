/**
 * Deterministic geocoding query builder + regional validation for location_zones.
 * Expands free-form `locality` for the provider only — does not mutate persisted values.
 */

import {
  resolveCanonicalLocality,
  type CanonicalLocalityResolution,
} from "./canonical-locality";
import type { GeocodeAddressComponent, GeocodeResult, GeocodeSuccess } from "./google-geocode";
import { isGeocodeSuccess, toGeocodeFailure, toGeocodeSuccess } from "./google-geocode";

export interface LocationZoneGeocodeInput {
  name: string;
  locality?: string | null;
}

/** Approximate mainland Argentina bounding box (reject obviously foreign results). */
export const ARGENTINA_LAT_MIN = -55.2;
export const ARGENTINA_LAT_MAX = -21.5;
export const ARGENTINA_LNG_MIN = -73.8;
export const ARGENTINA_LNG_MAX = -53.4;

export const isWithinArgentinaBounds = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= ARGENTINA_LAT_MIN &&
  latitude <= ARGENTINA_LAT_MAX &&
  longitude >= ARGENTINA_LNG_MIN &&
  longitude <= ARGENTINA_LNG_MAX;

/** Approximate Ciudad Autónoma de Buenos Aires (barrio-level geocodes often lack CABA admin1). */
export const CABA_LAT_MIN = -34.71;
export const CABA_LAT_MAX = -34.52;
export const CABA_LNG_MIN = -58.54;
export const CABA_LNG_MAX = -58.33;

export const isWithinCabaBounds = (latitude: number, longitude: number): boolean =>
  isWithinArgentinaBounds(latitude, longitude) &&
  latitude >= CABA_LAT_MIN &&
  latitude <= CABA_LAT_MAX &&
  longitude >= CABA_LNG_MIN &&
  longitude <= CABA_LNG_MAX;

/** Approximate AMBA / GBA (province of Buenos Aires metro, excluding CABA proper). */
export const GBA_LAT_MIN = -34.92;
export const GBA_LAT_MAX = -34.18;
export const GBA_LNG_MIN = -59.12;
export const GBA_LNG_MAX = -58.04;

export const isWithinGbaBounds = (latitude: number, longitude: number): boolean =>
  isWithinArgentinaBounds(latitude, longitude) &&
  latitude >= GBA_LAT_MIN &&
  latitude <= GBA_LAT_MAX &&
  longitude >= GBA_LNG_MIN &&
  longitude <= GBA_LNG_MAX &&
  !isWithinCabaBounds(latitude, longitude);

const normalizeKey = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export type StrongGeocodeRegion = NonNullable<CanonicalLocalityResolution["strongRegion"]>;

export const resolveStrongGeocodeRegion = (
  locality: string | null | undefined,
): StrongGeocodeRegion | null => resolveCanonicalLocality(locality).strongRegion;

const adminLevel1 = (components: GeocodeAddressComponent[]): GeocodeAddressComponent | null =>
  components.find((component) => component.types.includes("administrative_area_level_1")) ?? null;

const matchesAdminLevel1 = (
  components: GeocodeAddressComponent[],
  predicates: Array<(longKey: string, shortKey: string) => boolean>,
): boolean => {
  const admin = adminLevel1(components);
  if (!admin) {
    return false;
  }
  const longKey = normalizeKey(admin.longName);
  const shortKey = normalizeKey(admin.shortName);
  return predicates.some((predicate) => predicate(longKey, shortKey));
};

const componentBlob = (components: GeocodeAddressComponent[]): string =>
  components
    .map((component) => `${component.longName} ${component.shortName}`)
    .join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const looksLikeCabaAdmin1 = (components: GeocodeAddressComponent[]): boolean =>
  matchesAdminLevel1(components, [
    (longKey, shortKey) =>
      longKey.includes("ciudad autonoma") ||
      longKey.includes("autonomous city") ||
      shortKey === "caba" ||
      shortKey === "c",
  ]);

const looksLikeBuenosAiresProvinceAdmin1 = (components: GeocodeAddressComponent[]): boolean =>
  matchesAdminLevel1(components, [
    (longKey, shortKey) =>
      shortKey === "b" ||
      longKey === "buenos aires" ||
      longKey.includes("provincia de buenos aires") ||
      (longKey.includes("buenos aires") &&
        !longKey.includes("ciudad autonoma") &&
        !longKey.includes("autonomous city")),
  ]);

const blobMentionsOtherProvince = (blob: string): boolean =>
  blob.includes("cordoba") ||
  blob.includes("santa fe") ||
  blob.includes("salta") ||
  blob.includes("mendoza");

const blobMentionsBuenosAiresProvince = (blob: string): boolean =>
  blob.includes("buenos aires") &&
  !blob.includes("ciudad autonoma") &&
  !blob.includes("autonomous city");

/**
 * Prefer structured address_components; fall back to formatted_address only when needed.
 */
export const validateGeocodeAgainstLocality = (
  result: GeocodeResult,
  locality: string | null | undefined,
): GeocodeResult => {
  if (!isGeocodeSuccess(result)) {
    return result;
  }

  const strong = resolveStrongGeocodeRegion(locality);
  if (!strong) {
    return result;
  }

  if (!result.addressComponents.length && !result.formattedAddress) {
    return result;
  }

  const blob = `${(result.formattedAddress ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()} ${componentBlob(result.addressComponents)}`;

  if (strong === "CABA") {
    const looksCaba =
      looksLikeCabaAdmin1(result.addressComponents) ||
      blob.includes("ciudad autonoma de buenos aires") ||
      blob.includes("autonomous city of buenos aires") ||
      isWithinCabaBounds(result.latitude, result.longitude);
    if (!looksCaba) {
      return toGeocodeFailure(
        result.query,
        "REJECTED_REGION",
        "Geocoder result does not match Ciudad Autónoma de Buenos Aires",
      );
    }
    return result;
  }

  if (strong === "BUENOS_AIRES_PROVINCE") {
    // GBA / Provincia BA: accept province BA; reject CABA and other provinces.
    // Do not require a specific municipality.
    const looksCaba = looksLikeCabaAdmin1(result.addressComponents);
    const looksBuenosAiresProvince = looksLikeBuenosAiresProvinceAdmin1(result.addressComponents);
    if (!looksCaba && looksBuenosAiresProvince) {
      return result;
    }
    if (
      !looksCaba &&
      (isWithinGbaBounds(result.latitude, result.longitude) ||
        (!adminLevel1(result.addressComponents) &&
          blobMentionsBuenosAiresProvince(blob) &&
          !blobMentionsOtherProvince(blob)))
    ) {
      return result;
    }
    return toGeocodeFailure(
      result.query,
      "REJECTED_REGION",
      "Geocoder result does not match Provincia de Buenos Aires",
    );
  }

  if (strong === "CORDOBA") {
    const looksCordoba =
      matchesAdminLevel1(result.addressComponents, [
        (longKey, shortKey) => longKey.includes("cordoba") || shortKey === "x",
      ]) || blob.includes("cordoba");
    if (!looksCordoba) {
      return toGeocodeFailure(result.query, "REJECTED_REGION", "Geocoder result does not match Córdoba");
    }
    if (
      matchesAdminLevel1(result.addressComponents, [
        (longKey) => longKey.includes("ciudad autonoma"),
      ]) ||
      (blob.includes("ciudad autonoma") && !blob.includes("cordoba"))
    ) {
      return toGeocodeFailure(
        result.query,
        "REJECTED_REGION",
        "Geocoder result looks like CABA, expected Córdoba",
      );
    }
    return result;
  }

  if (strong === "SALTA") {
    const looksSalta =
      matchesAdminLevel1(result.addressComponents, [
        (longKey, shortKey) => longKey.includes("salta") || shortKey === "a",
      ]) || blob.includes("salta");
    if (!looksSalta) {
      return toGeocodeFailure(result.query, "REJECTED_REGION", "Geocoder result does not match Salta");
    }
    if (
      matchesAdminLevel1(result.addressComponents, [
        (longKey) => longKey.includes("ciudad autonoma") || longKey.includes("cordoba"),
      ])
    ) {
      return toGeocodeFailure(
        result.query,
        "REJECTED_REGION",
        "Geocoder result does not match Salta province",
      );
    }
    return result;
  }

  if (strong === "MENDOZA") {
    const looksMendoza =
      matchesAdminLevel1(result.addressComponents, [
        (longKey, shortKey) => longKey.includes("mendoza") || shortKey === "m",
      ]) || blob.includes("mendoza");
    if (!looksMendoza) {
      return toGeocodeFailure(
        result.query,
        "REJECTED_REGION",
        "Geocoder result does not match Mendoza",
      );
    }
    return result;
  }

  return result;
};

/**
 * Map free-form locality labels to a geocoder-friendly region string.
 * Returns null when locality is empty (query uses name + Argentina only).
 */
export const expandLocalityForGeocoding = (locality: string | null | undefined): string | null =>
  resolveCanonicalLocality(locality).geocodeRegion;

/**
 * Build a deterministic Google Geocoding address query for a location zone.
 */
export const buildLocationZoneGeocodingQuery = (zone: LocationZoneGeocodeInput): string => {
  const name = zone.name.trim().replace(/\s+/g, " ");
  if (!name) {
    throw new Error("Location zone name is required for geocoding");
  }

  const expanded = expandLocalityForGeocoding(zone.locality);
  const parts = expanded ? [name, expanded, "Argentina"] : [name, "Argentina"];
  return parts.join(", ");
};

/**
 * Pick the first Google candidate compatible with AR bounds + locality context.
 * Deterministic: preserve provider order after filters.
 */
export const selectCompatibleGeocodeCandidate = (
  candidates: GeocodeSuccess[],
  locality: string | null | undefined,
): GeocodeResult => {
  if (candidates.length === 0) {
    return toGeocodeFailure("", "ZERO_RESULTS", "No geocoding candidates");
  }

  for (const candidate of candidates) {
    if (candidate.countryCode && candidate.countryCode !== "AR") {
      continue;
    }
    if (!isWithinArgentinaBounds(candidate.latitude, candidate.longitude)) {
      continue;
    }
    const validated = validateGeocodeAgainstLocality(candidate, locality);
    if (isGeocodeSuccess(validated)) {
      return validated;
    }
  }

  // Fall back to validating the first candidate so callers get a precise rejection.
  const first = candidates[0]!;
  if (first.countryCode && first.countryCode !== "AR") {
    return toGeocodeFailure(
      first.query,
      "REJECTED_COUNTRY",
      `Geocoder returned country ${first.countryCode}, expected AR`,
    );
  }
  if (!isWithinArgentinaBounds(first.latitude, first.longitude)) {
    return toGeocodeFailure(
      first.query,
      "REJECTED_BOUNDS",
      "Geocoder coordinates are outside approximate Argentina bounds",
    );
  }
  return validateGeocodeAgainstLocality(first, locality);
};

/** @internal test helper — build a success candidate. */
export const asGeocodeSuccess = (
  query: string,
  latitude: number,
  longitude: number,
  extras: Partial<GeocodeSuccess> = {},
): GeocodeSuccess =>
  toGeocodeSuccess(
    query,
    latitude,
    longitude,
    extras.countryCode ?? "AR",
    extras.formattedAddress ?? null,
    extras.addressComponents ?? [],
  );
