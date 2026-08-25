/**
 * Service reconciliation geocoding — thin adapter over shared Google client.
 * Keeps file-based cache used by reconcile CLI.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  geocodeQuery as sharedGeocodeQuery,
  isGeocodeSuccess,
  type GeocodeResult,
} from "../geocoding/google-geocode";
import type { GeocodingDiagnostics, OfficialService } from "./types";

export interface GeocodedCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeCacheSuccess extends GeocodedCoordinates {
  status: "OK";
  query: string;
}

export interface GeocodeCacheFailure {
  status: string;
  errorMessage: string;
  query: string;
}

export type GeocodeCacheEntry = GeocodeCacheSuccess | GeocodeCacheFailure;

export type GeocodeCache = Record<string, GeocodeCacheEntry>;

export const TEST_GEOCODING_ADDRESS = "Av. Rivadavia 3751, Almagro, Buenos Aires, Argentina";

export const buildGeocodeCacheKey = (service: OfficialService): string =>
  [service.officialAddress, service.neighborhood, service.locality, "Argentina"]
    .map((part) => part.trim().toLowerCase())
    .join("|");

export const buildGeocodeQuery = (service: OfficialService): string =>
  [service.officialAddress, service.neighborhood, service.locality, "Argentina"]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

const toFailure = (
  query: string,
  status: string,
  errorMessage: string,
): GeocodeCacheFailure => ({
  status,
  errorMessage,
  query,
});

const toSuccess = (
  query: string,
  latitude: number,
  longitude: number,
): GeocodeCacheSuccess => ({
  status: "OK",
  query,
  latitude,
  longitude,
});

const toCacheEntry = (result: GeocodeResult): GeocodeCacheEntry => {
  if (isGeocodeSuccess(result)) {
    return toSuccess(result.query, result.latitude, result.longitude);
  }
  return toFailure(result.query, result.status, result.errorMessage);
};

const isLegacyFailedEntry = (entry: unknown): entry is { failed: true } =>
  Boolean(entry && typeof entry === "object" && "failed" in entry);

export const geocodeQuery = async (
  query: string,
  apiKey: string,
): Promise<GeocodeCacheEntry> => toCacheEntry(await sharedGeocodeQuery(query, apiKey));

export const geocodeOfficialService = async (
  service: OfficialService,
  apiKey: string,
): Promise<GeocodeCacheEntry> => geocodeQuery(buildGeocodeQuery(service), apiKey);

export const loadGeocodeCache = (cachePath: string): GeocodeCache => {
  try {
    const raw = readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw) as GeocodeCache;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const normalized: GeocodeCache = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (isLegacyFailedEntry(entry)) {
        continue;
      }
      normalized[key] = entry;
    }
    return normalized;
  } catch {
    return {};
  }
};

export const saveGeocodeCache = (cachePath: string, cache: GeocodeCache): void => {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
};

export const resolveGeocodedCoordinates = async (
  service: OfficialService,
  apiKey: string,
  cache: GeocodeCache,
  cachePath: string,
  delayMs: number,
): Promise<GeocodeCacheEntry> => {
  const cacheKey = buildGeocodeCacheKey(service);
  const cached = cache[cacheKey];
  if (cached) {
    return cached;
  }

  if (delayMs > 0) {
    await new Promise<void>((resolveDelay) => {
      setTimeout(resolveDelay, delayMs);
    });
  }

  const result = await geocodeOfficialService(service, apiKey);
  cache[cacheKey] = result;
  saveGeocodeCache(cachePath, cache);
  return result;
};

export const toGeocodingDiagnostics = (entry: GeocodeCacheEntry): GeocodingDiagnostics => {
  if (entry.status === "OK" && "latitude" in entry) {
    return {
      status: entry.status,
      errorCode: "",
      errorMessage: "",
      query: entry.query,
      latitude: entry.latitude,
      longitude: entry.longitude,
    };
  }

  const failure = entry as GeocodeCacheFailure;
  return {
    status: failure.status,
    errorCode: failure.status,
    errorMessage: failure.errorMessage,
    query: failure.query,
    latitude: null,
    longitude: null,
  };
};

export const runGeocodingDiagnostic = async (
  apiKey: string,
  query = TEST_GEOCODING_ADDRESS,
): Promise<GeocodeCacheEntry> => geocodeQuery(query, apiKey);
