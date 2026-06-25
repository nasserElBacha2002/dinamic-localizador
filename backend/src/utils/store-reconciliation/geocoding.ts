import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { OfficialStore } from "./types";

export interface GeocodedCoordinates {
  latitude: number;
  longitude: number;
}

export type GeocodeCacheEntry = GeocodedCoordinates | { failed: true };

export type GeocodeCache = Record<string, GeocodeCacheEntry>;

export const buildGeocodeCacheKey = (store: OfficialStore): string =>
  [store.officialAddress, store.neighborhood, store.locality, "Argentina"]
    .map((part) => part.trim().toLowerCase())
    .join("|");

export const buildGeocodeQuery = (store: OfficialStore): string =>
  [store.officialAddress, store.neighborhood, store.locality, "Argentina"]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

export const loadGeocodeCache = (cachePath: string): GeocodeCache => {
  try {
    const raw = readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw) as GeocodeCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const saveGeocodeCache = (cachePath: string, cache: GeocodeCache): void => {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
};

interface GoogleGeocodeResponse {
  status: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
}

export const geocodeOfficialStore = async (
  store: OfficialStore,
  apiKey: string,
): Promise<GeocodedCoordinates | "failed"> => {
  const query = buildGeocodeQuery(store);
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("region", "ar");

  const response = await fetch(url);
  if (!response.ok) {
    return "failed";
  }

  const payload = (await response.json()) as GoogleGeocodeResponse;
  if (payload.status !== "OK" || !payload.results?.length) {
    return "failed";
  }

  const location = payload.results[0]?.geometry?.location;
  const latitude = location?.lat;
  const longitude = location?.lng;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "failed";
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
};

export const resolveGeocodedCoordinates = async (
  store: OfficialStore,
  apiKey: string | null,
  cache: GeocodeCache,
  cachePath: string,
  delayMs: number,
): Promise<GeocodedCoordinates | "failed" | "skipped"> => {
  if (!apiKey) {
    return "skipped";
  }

  const cacheKey = buildGeocodeCacheKey(store);
  const cached = cache[cacheKey];
  if (cached) {
    return "failed" in cached ? "failed" : cached;
  }

  if (delayMs > 0) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  const result = await geocodeOfficialStore(store, apiKey);
  cache[cacheKey] = result === "failed" ? { failed: true } : result;
  saveGeocodeCache(cachePath, cache);
  return result;
};
