/**
 * Shared Google Maps Geocoding client (services + location zones).
 * Does not log API keys or full provider payloads.
 */

/** Default per-request timeout for Google Geocoding HTTP calls. */
export const GOOGLE_GEOCODE_TIMEOUT_MS = 10_000;

export interface GeocodedCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeAddressComponent {
  longName: string;
  shortName: string;
  types: string[];
}

export interface GeocodeSuccess extends GeocodedCoordinates {
  status: "OK";
  query: string;
  /** ISO country code from address_components when available (e.g. AR). */
  countryCode: string | null;
  formattedAddress: string | null;
  addressComponents: GeocodeAddressComponent[];
}

export interface GeocodeFailure {
  status: string;
  errorMessage: string;
  query: string;
  /** HTTP status when failure came from transport layer. */
  httpStatus?: number;
}

export type GeocodeResult = GeocodeSuccess | GeocodeFailure;

interface GoogleAddressComponent {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    address_components?: GoogleAddressComponent[];
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
}

const extractCountryCode = (components: GoogleAddressComponent[] | undefined): string | null => {
  if (!components?.length) {
    return null;
  }
  const country = components.find((component) => component.types?.includes("country"));
  const code = country?.short_name?.trim().toUpperCase();
  return code || null;
};

const mapAddressComponents = (
  components: GoogleAddressComponent[] | undefined,
): GeocodeAddressComponent[] => {
  if (!components?.length) {
    return [];
  }
  return components.map((component) => ({
    longName: component.long_name?.trim() ?? "",
    shortName: component.short_name?.trim() ?? "",
    types: Array.isArray(component.types) ? component.types : [],
  }));
};

const buildGeocodeUrl = (query: string, apiKey: string): URL => {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("region", "ar");
  url.searchParams.set("components", "country:AR");
  return url;
};

export const toGeocodeFailure = (
  query: string,
  status: string,
  errorMessage: string,
  httpStatus?: number,
): GeocodeFailure => ({
  status,
  errorMessage,
  query,
  ...(httpStatus !== undefined ? { httpStatus } : {}),
});

export const toGeocodeSuccess = (
  query: string,
  latitude: number,
  longitude: number,
  countryCode: string | null = null,
  formattedAddress: string | null = null,
  addressComponents: GeocodeAddressComponent[] = [],
): GeocodeSuccess => ({
  status: "OK",
  query,
  latitude,
  longitude,
  countryCode,
  formattedAddress,
  addressComponents,
});

export const isGeocodeSuccess = (result: GeocodeResult): result is GeocodeSuccess =>
  result.status === "OK" && "latitude" in result;

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String((error as { name?: unknown }).name) : "";
  return name === "AbortError" || name === "TimeoutError";
};

/** Permanent provider statuses that should not be retried. */
export const isNonRetryableGeocodeStatus = (status: string): boolean => {
  const normalized = status.trim().toUpperCase();
  return (
    normalized === "ZERO_RESULTS" ||
    normalized === "INVALID_REQUEST" ||
    normalized === "REQUEST_DENIED" ||
    normalized === "INVALID_RESPONSE" ||
    normalized === "INVALID_JSON" ||
    normalized === "REJECTED_BOUNDS" ||
    normalized === "REJECTED_COUNTRY" ||
    normalized === "REJECTED_REGION"
  );
};

export const isTransientGeocodeFailure = (result: GeocodeFailure): boolean => {
  if (isNonRetryableGeocodeStatus(result.status)) {
    return false;
  }
  if (
    result.status === "OVER_QUERY_LIMIT" ||
    result.status === "UNKNOWN_ERROR" ||
    result.status === "TIMEOUT"
  ) {
    return true;
  }
  if (result.status === "HTTP_ERROR") {
    const code = result.httpStatus;
    if (code === 429 || (typeof code === "number" && code >= 500)) {
      return true;
    }
    // Network / fetch failures often lack httpStatus.
    return code === undefined;
  }
  return false;
};

export const geocodeQuery = async (
  query: string,
  apiKey: string,
  options: { timeoutMs?: number } = {},
): Promise<GeocodeResult> => {
  const url = buildGeocodeUrl(query, apiKey);
  const timeoutMs = options.timeoutMs ?? GOOGLE_GEOCODE_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isAbortError(error)) {
      return toGeocodeFailure(query, "TIMEOUT", `Geocoding request timed out after ${timeoutMs}ms`);
    }
    const message = error instanceof Error ? error.message : String(error);
    return toGeocodeFailure(query, "HTTP_ERROR", message);
  }

  if (!response.ok) {
    return toGeocodeFailure(
      query,
      "HTTP_ERROR",
      `HTTP ${response.status} ${response.statusText}`.trim(),
      response.status,
    );
  }

  let payload: GoogleGeocodeResponse;
  try {
    payload = (await response.json()) as GoogleGeocodeResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toGeocodeFailure(query, "INVALID_JSON", message);
  }

  if (payload.status !== "OK") {
    return toGeocodeFailure(
      query,
      payload.status || "UNKNOWN_ERROR",
      payload.error_message?.trim() || `Google Geocoding API returned status ${payload.status}`,
    );
  }

  const first = payload.results?.[0];
  const latitude = first?.geometry?.location?.lat;
  const longitude = first?.geometry?.location?.lng;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return toGeocodeFailure(query, "INVALID_RESPONSE", "Geocoding response did not include coordinates");
  }

  return toGeocodeSuccess(
    query,
    Number(latitude),
    Number(longitude),
    extractCountryCode(first?.address_components),
    first?.formatted_address?.trim() || null,
    mapAddressComponents(first?.address_components),
  );
};

export type GeocodeCandidatesOk = {
  status: "OK";
  query: string;
  candidates: GeocodeSuccess[];
};

export type GeocodeCandidatesResult = GeocodeCandidatesOk | GeocodeFailure;

export const isGeocodeCandidatesOk = (
  result: GeocodeCandidatesResult,
): result is GeocodeCandidatesOk =>
  result.status === "OK" && Array.isArray((result as GeocodeCandidatesOk).candidates);

/**
 * Return all Google results with coordinates (provider order preserved).
 * Callers select a locality-compatible candidate deterministically.
 */
export const geocodeQueryCandidates = async (
  query: string,
  apiKey: string,
  options: { timeoutMs?: number } = {},
): Promise<GeocodeCandidatesResult> => {
  const url = buildGeocodeUrl(query, apiKey);
  const timeoutMs = options.timeoutMs ?? GOOGLE_GEOCODE_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isAbortError(error)) {
      return toGeocodeFailure(query, "TIMEOUT", `Geocoding request timed out after ${timeoutMs}ms`);
    }
    const message = error instanceof Error ? error.message : String(error);
    return toGeocodeFailure(query, "HTTP_ERROR", message);
  }

  if (!response.ok) {
    return toGeocodeFailure(
      query,
      "HTTP_ERROR",
      `HTTP ${response.status} ${response.statusText}`.trim(),
      response.status,
    );
  }

  let payload: GoogleGeocodeResponse;
  try {
    payload = (await response.json()) as GoogleGeocodeResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toGeocodeFailure(query, "INVALID_JSON", message);
  }

  if (payload.status !== "OK") {
    return toGeocodeFailure(
      query,
      payload.status || "UNKNOWN_ERROR",
      payload.error_message?.trim() || `Google Geocoding API returned status ${payload.status}`,
    );
  }

  const candidates: GeocodeSuccess[] = [];
  for (const row of payload.results ?? []) {
    const latitude = row.geometry?.location?.lat;
    const longitude = row.geometry?.location?.lng;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }
    candidates.push(
      toGeocodeSuccess(
        query,
        Number(latitude),
        Number(longitude),
        extractCountryCode(row.address_components),
        row.formatted_address?.trim() || null,
        mapAddressComponents(row.address_components),
      ),
    );
  }

  if (candidates.length === 0) {
    return toGeocodeFailure(
      query,
      "INVALID_RESPONSE",
      "Geocoding response did not include coordinates",
    );
  }

  return { status: "OK", query, candidates };
};

export const delayMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Geocode with limited retries for transient failures (429 / 5xx / timeout / OVER_QUERY_LIMIT).
 */
export const geocodeQueryWithRetry = async (
  query: string,
  apiKey: string,
  options: { maxAttempts?: number; baseDelayMs?: number; timeoutMs?: number } = {},
): Promise<GeocodeResult> => {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;

  let last: GeocodeResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await geocodeQuery(query, apiKey, { timeoutMs: options.timeoutMs });
    if (isGeocodeSuccess(last)) {
      return last;
    }
    if (!isTransientGeocodeFailure(last) || attempt >= maxAttempts) {
      return last;
    }
    await delayMs(baseDelayMs * attempt);
  }

  return last ?? toGeocodeFailure(query, "UNKNOWN_ERROR", "Geocoding produced no result");
};

export const geocodeQueryCandidatesWithRetry = async (
  query: string,
  apiKey: string,
  options: { maxAttempts?: number; baseDelayMs?: number; timeoutMs?: number } = {},
): Promise<GeocodeCandidatesResult> => {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;

  let last: GeocodeCandidatesResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    last = await geocodeQueryCandidates(query, apiKey, { timeoutMs: options.timeoutMs });
    if (isGeocodeCandidatesOk(last)) {
      return last;
    }
    if (!isTransientGeocodeFailure(last) || attempt >= maxAttempts) {
      return last;
    }
    await delayMs(baseDelayMs * attempt);
  }

  return last ?? toGeocodeFailure(query, "UNKNOWN_ERROR", "Geocoding produced no result");
};
