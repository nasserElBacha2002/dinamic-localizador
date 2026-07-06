import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
}

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

const buildGeocodeUrl = (query: string, apiKey: string): URL => {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("region", "ar");
  url.searchParams.set("components", "country:AR");
  return url;
};

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

const isLegacyFailedEntry = (entry: unknown): entry is { failed: true } =>
  Boolean(entry && typeof entry === "object" && "failed" in entry);

export const geocodeQuery = async (
  query: string,
  apiKey: string,
): Promise<GeocodeCacheEntry> => {
  const url = buildGeocodeUrl(query, apiKey);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toFailure(query, "HTTP_ERROR", message);
  }

  if (!response.ok) {
    return toFailure(
      query,
      "HTTP_ERROR",
      `HTTP ${response.status} ${response.statusText}`.trim(),
    );
  }

  let payload: GoogleGeocodeResponse;
  try {
    payload = (await response.json()) as GoogleGeocodeResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toFailure(query, "INVALID_JSON", message);
  }

  if (payload.status !== "OK") {
    return toFailure(
      query,
      payload.status || "UNKNOWN_ERROR",
      payload.error_message?.trim() || `Google Geocoding API returned status ${payload.status}`,
    );
  }

  const location = payload.results?.[0]?.geometry?.location;
  const latitude = location?.lat;
  const longitude = location?.lng;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return toFailure(query, "INVALID_RESPONSE", "Geocoding response did not include coordinates");
  }

  return toSuccess(query, Number(latitude), Number(longitude));
};

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
