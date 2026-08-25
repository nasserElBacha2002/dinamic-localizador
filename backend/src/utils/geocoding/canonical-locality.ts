/**
 * Canonical geographic context for location_zones.locality.
 *
 * Semantics (Phase C):
 * - `name` = barrio / zona operativa visible (Caballito, Bernal, Centro, …)
 * - `locality` = free-form superior context for disambiguation (CABA, GBA, Córdoba, …)
 * - Display `locality` is preserved as entered; canonical codes drive geocoding/validation only.
 *
 * GBA is an informal metro region → AR-B-METRO (not a municipality).
 * Capital → AR-CABA only as a product alias (dataset historically treats Capital as CABA).
 */

export const CANONICAL_LOCALITY_CODES = [
  "AR-CABA",
  "AR-B-METRO",
  "AR-B",
  "AR-X-CORDOBA",
  "AR-A-SALTA",
  "AR-M-MENDOZA",
] as const;

export type CanonicalLocalityCode = (typeof CANONICAL_LOCALITY_CODES)[number];

export type CanonicalLocalityResolutionStatus = "RESOLVED" | "UNKNOWN";

export type CanonicalLocalityResolution = {
  status: CanonicalLocalityResolutionStatus;
  code: CanonicalLocalityCode | null;
  /** Geocoder-friendly region label (never mutates persisted locality). */
  geocodeRegion: string | null;
  /** Strong administrative match required when validating Google components. */
  strongRegion: "CABA" | "BUENOS_AIRES_PROVINCE" | "CORDOBA" | "SALTA" | "MENDOZA" | null;
  /** Original trimmed display locality, or null if empty. */
  displayLocality: string | null;
};

const normalizeKey = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

type AliasEntry = {
  code: CanonicalLocalityCode;
  geocodeRegion: string;
  strongRegion: CanonicalLocalityResolution["strongRegion"];
};

/**
 * Central alias table — do not scatter if/else locality strings across services.
 * Keys are accent/case-insensitive via normalizeKey.
 */
export const LOCALITY_ALIASES: Record<string, AliasEntry> = {
  caba: {
    code: "AR-CABA",
    geocodeRegion: "Ciudad Autónoma de Buenos Aires",
    strongRegion: "CABA",
  },
  "c.a.b.a.": {
    code: "AR-CABA",
    geocodeRegion: "Ciudad Autónoma de Buenos Aires",
    strongRegion: "CABA",
  },
  capital: {
    code: "AR-CABA",
    geocodeRegion: "Ciudad Autónoma de Buenos Aires",
    strongRegion: "CABA",
  },
  "capital federal": {
    code: "AR-CABA",
    geocodeRegion: "Ciudad Autónoma de Buenos Aires",
    strongRegion: "CABA",
  },
  "ciudad autonoma de buenos aires": {
    code: "AR-CABA",
    geocodeRegion: "Ciudad Autónoma de Buenos Aires",
    strongRegion: "CABA",
  },
  "ciudad de buenos aires": {
    code: "AR-CABA",
    geocodeRegion: "Ciudad Autónoma de Buenos Aires",
    strongRegion: "CABA",
  },
  "bs as capital": {
    code: "AR-CABA",
    geocodeRegion: "Ciudad Autónoma de Buenos Aires",
    strongRegion: "CABA",
  },
  "bs.as. capital": {
    code: "AR-CABA",
    geocodeRegion: "Ciudad Autónoma de Buenos Aires",
    strongRegion: "CABA",
  },
  gba: {
    code: "AR-B-METRO",
    geocodeRegion: "Buenos Aires",
    strongRegion: "BUENOS_AIRES_PROVINCE",
  },
  "gran buenos aires": {
    code: "AR-B-METRO",
    geocodeRegion: "Buenos Aires",
    strongRegion: "BUENOS_AIRES_PROVINCE",
  },
  amba: {
    code: "AR-B-METRO",
    geocodeRegion: "Buenos Aires",
    strongRegion: "BUENOS_AIRES_PROVINCE",
  },
  "buenos aires": {
    code: "AR-B",
    geocodeRegion: "Buenos Aires",
    strongRegion: "BUENOS_AIRES_PROVINCE",
  },
  "bs as": {
    code: "AR-B",
    geocodeRegion: "Buenos Aires",
    strongRegion: "BUENOS_AIRES_PROVINCE",
  },
  "bs.as.": {
    code: "AR-B",
    geocodeRegion: "Buenos Aires",
    strongRegion: "BUENOS_AIRES_PROVINCE",
  },
  "provincia de buenos aires": {
    code: "AR-B",
    geocodeRegion: "Buenos Aires",
    strongRegion: "BUENOS_AIRES_PROVINCE",
  },
  cordoba: {
    code: "AR-X-CORDOBA",
    geocodeRegion: "Córdoba",
    strongRegion: "CORDOBA",
  },
  "provincia de cordoba": {
    code: "AR-X-CORDOBA",
    geocodeRegion: "Córdoba",
    strongRegion: "CORDOBA",
  },
  salta: {
    code: "AR-A-SALTA",
    geocodeRegion: "Salta",
    strongRegion: "SALTA",
  },
  "provincia de salta": {
    code: "AR-A-SALTA",
    geocodeRegion: "Salta",
    strongRegion: "SALTA",
  },
  mendoza: {
    code: "AR-M-MENDOZA",
    geocodeRegion: "Mendoza",
    strongRegion: "MENDOZA",
  },
  "provincia de mendoza": {
    code: "AR-M-MENDOZA",
    geocodeRegion: "Mendoza",
    strongRegion: "MENDOZA",
  },
};

/** Suggested display localities for admin UI (not a closed enum). */
export const SUGGESTED_LOCALITY_LABELS = [
  "CABA",
  "GBA",
  "Buenos Aires",
  "Córdoba",
  "Salta",
  "Mendoza",
] as const;

export const resolveCanonicalLocality = (
  locality: string | null | undefined,
): CanonicalLocalityResolution => {
  if (locality === null || locality === undefined) {
    return {
      status: "UNKNOWN",
      code: null,
      geocodeRegion: null,
      strongRegion: null,
      displayLocality: null,
    };
  }
  const trimmed = locality.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return {
      status: "UNKNOWN",
      code: null,
      geocodeRegion: null,
      strongRegion: null,
      displayLocality: null,
    };
  }

  const alias = LOCALITY_ALIASES[normalizeKey(trimmed)];
  if (alias) {
    return {
      status: "RESOLVED",
      code: alias.code,
      geocodeRegion: alias.geocodeRegion,
      strongRegion: alias.strongRegion,
      displayLocality: trimmed,
    };
  }

  return {
    status: "UNKNOWN",
    code: null,
    geocodeRegion: trimmed,
    strongRegion: null,
    displayLocality: trimmed,
  };
};

export const normalizeLocalityKey = normalizeKey;
