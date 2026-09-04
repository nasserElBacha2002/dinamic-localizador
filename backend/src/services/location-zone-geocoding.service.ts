import { resolveGoogleMapsApiKey } from "../utils/service-reconciliation/env";
import {
  geocodeQueryCandidatesWithRetry,
  isGeocodeCandidatesOk,
  isGeocodeSuccess,
  type GeocodeResult,
} from "../utils/geocoding/google-geocode";
import {
  buildLocationZoneGeocodingQuery,
  selectCompatibleGeocodeCandidate,
} from "../utils/geocoding/location-zone-query";
import { locationZoneRepository } from "../repositories/location-zone.repository";
import type { LocationZone } from "../types/location-zone";
import type { LocationZoneGeocodingWrite } from "../repositories/location-zone.repository";

const LOG_PREFIX = "[location-zone-geocoding]";

export type LocationZoneGeocodeOutcome =
  | "RESOLVED"
  | "FAILED"
  | "SKIPPED_MANUAL"
  | "SKIPPED_ALREADY_RESOLVED"
  | "SKIPPED_NO_API_KEY"
  | "SKIPPED_CONCURRENT_MANUAL"
  | "SKIPPED_STALE_INPUT"
  | "SKIPPED_NOT_FOUND";

export interface LocationZoneGeocodeAttemptResult {
  zoneId: string;
  companyId: string | null;
  query: string | null;
  outcome: LocationZoneGeocodeOutcome;
  errorMessage?: string;
  zone?: LocationZone;
}

export interface LocationZoneGeocodeBatchSummary {
  total: number;
  resolved: number;
  failed: number;
  skipped: number;
  manualSkipped: number;
  alreadyResolved: number;
  noApiKeySkipped: number;
  staleSkipped: number;
}

const truncateError = (message: string, max = 500): string =>
  message.length <= max ? message : `${message.slice(0, max - 1)}…`;

const zoneCompanyId = (zone: LocationZone): string | null => {
  if (!("companyId" in zone)) {
    return null;
  }
  const value = zone.companyId;
  return value == null ? null : value;
};

const hasResolvedCentroids = (zone: LocationZone): boolean =>
  zone.centroidLatitude !== null &&
  zone.centroidLongitude !== null &&
  (zone.geocodingStatus === "RESOLVED" || zone.geocodingStatus === "MANUAL");

const isManualProtected = (zone: LocationZone): boolean =>
  zone.geocodingSource === "MANUAL" || zone.geocodingStatus === "MANUAL";

const sameUpdatedAtMs = (left: string, right: string): boolean => {
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
};

const classifySkippedWrite = async (
  zone: LocationZone,
  expectedNormalizedName: string,
  expectedNormalizedLocality: string,
  expectedUpdatedAt: string,
  allowManualOverride: boolean,
): Promise<
  "SKIPPED_CONCURRENT_MANUAL" | "SKIPPED_STALE_INPUT" | "SKIPPED_NOT_FOUND"
> => {
  const companyId = zoneCompanyId(zone);
  const current = companyId
    ? await locationZoneRepository.findByIdForCompany(companyId, zone.id)
    : await locationZoneRepository.findById(zone.id);
  if (!current) {
    return "SKIPPED_NOT_FOUND";
  }
  if (
    current.normalizedName !== expectedNormalizedName ||
    current.normalizedLocality !== expectedNormalizedLocality ||
    !sameUpdatedAtMs(current.updatedAt, expectedUpdatedAt)
  ) {
    return "SKIPPED_STALE_INPUT";
  }
  if (!allowManualOverride && isManualProtected(current)) {
    return "SKIPPED_CONCURRENT_MANUAL";
  }
  return "SKIPPED_STALE_INPUT";
};

export const locationZoneGeocodingService = {
  buildQuery(zone: Pick<LocationZone, "name" | "locality">): string {
    return buildLocationZoneGeocodingQuery(zone);
  },

  /**
   * Geocode a single zone. Never overwrites MANUAL unless force=true.
   * When force=true (explicit admin re-geocode), MANUAL may be replaced with AUTO
   * only after a successful Google result. force never skips optimistic concurrency
   * on normalized name/locality/updated_at.
   *
   * Fire-and-forget (`scheduleGeocode`) is best-effort in-process; CLI backfill
   * (`npm run location-zones:geocode`) is the durable recovery path for PENDING.
   */
  async geocodeZone(
    zone: LocationZone,
    options: {
      force?: boolean;
      apiKey?: string | null;
      delayBeforeMs?: number;
    } = {},
  ): Promise<LocationZoneGeocodeAttemptResult> {
    const force = Boolean(options.force);
    const query = this.buildQuery(zone);
    const expectedNormalizedName = zone.normalizedName;
    const expectedNormalizedLocality = zone.normalizedLocality;
    const expectedUpdatedAt = zone.updatedAt;
    const startedAsManual = isManualProtected(zone);

    if (!force && isManualProtected(zone)) {
      console.info(`${LOG_PREFIX} LOCATION_ZONE_GEOCODING_SKIPPED`, {
        event: "LOCATION_ZONE_GEOCODING_SKIPPED",
        reason: "MANUAL",
        zoneId: zone.id,
        companyId: zoneCompanyId(zone),
      });
      return {
        zoneId: zone.id,
        companyId: zoneCompanyId(zone),
        query,
        outcome: "SKIPPED_MANUAL",
      };
    }

    if (
      !force &&
      hasResolvedCentroids(zone) &&
      zone.geocodingStatus === "RESOLVED" &&
      zone.geocodingSource === "AUTO"
    ) {
      console.info(`${LOG_PREFIX} LOCATION_ZONE_GEOCODING_SKIPPED`, {
        event: "LOCATION_ZONE_GEOCODING_SKIPPED",
        reason: "ALREADY_RESOLVED",
        zoneId: zone.id,
        companyId: zoneCompanyId(zone),
      });
      return {
        zoneId: zone.id,
        companyId: zoneCompanyId(zone),
        query,
        outcome: "SKIPPED_ALREADY_RESOLVED",
      };
    }

    const apiKey =
      options.apiKey !== undefined ? options.apiKey : resolveGoogleMapsApiKey().key;
    if (!apiKey) {
      console.info(`${LOG_PREFIX} LOCATION_ZONE_GEOCODING_SKIPPED`, {
        event: "LOCATION_ZONE_GEOCODING_SKIPPED",
        reason: "NO_API_KEY",
        zoneId: zone.id,
        companyId: zoneCompanyId(zone),
      });
      return {
        zoneId: zone.id,
        companyId: zoneCompanyId(zone),
        query,
        outcome: "SKIPPED_NO_API_KEY",
        errorMessage: "GOOGLE_MAPS_API_KEY is not configured",
      };
    }

    console.info(`${LOG_PREFIX} LOCATION_ZONE_GEOCODING_STARTED`, {
      event: "LOCATION_ZONE_GEOCODING_STARTED",
      zoneId: zone.id,
      companyId: zoneCompanyId(zone),
      query,
      force,
    });

    if (options.delayBeforeMs && options.delayBeforeMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, options.delayBeforeMs);
      });
    }

    const raw = await geocodeQueryCandidatesWithRetry(query, apiKey);
    const result: GeocodeResult = isGeocodeCandidatesOk(raw)
      ? selectCompatibleGeocodeCandidate(raw.candidates, zone.locality)
      : raw;

    const persistGeocode = async (
      write: LocationZoneGeocodingWrite,
    ): Promise<LocationZone | null> =>
      locationZoneRepository.applyGeocodeResult(zone.id, write, {
        expectedNormalizedName,
        expectedNormalizedLocality,
        expectedUpdatedAt,
        allowManualOverride: force,
      });

    const skippedWriteResult = async (): Promise<LocationZoneGeocodeAttemptResult> => {
      const outcome = await classifySkippedWrite(
        zone,
        expectedNormalizedName,
        expectedNormalizedLocality,
        expectedUpdatedAt,
        force,
      );
      console.info(`${LOG_PREFIX} LOCATION_ZONE_GEOCODING_SKIPPED`, {
        event: "LOCATION_ZONE_GEOCODING_SKIPPED",
        reason: outcome,
        zoneId: zone.id,
        companyId: zoneCompanyId(zone),
        force,
      });
      return {
        zoneId: zone.id,
        companyId: zoneCompanyId(zone),
        query,
        outcome,
      };
    };

    if (!isGeocodeSuccess(result)) {
      const errorMessage = truncateError(result.errorMessage || result.status);

      // MANUAL + force + failure: never destroy valid manual centroids.
      if (force && startedAsManual) {
        console.info(`${LOG_PREFIX} LOCATION_ZONE_GEOCODING_FAILED`, {
          event: "LOCATION_ZONE_GEOCODING_FAILED",
          zoneId: zone.id,
          companyId: zoneCompanyId(zone),
          query,
          status: result.status,
          errorMessage,
          preservedManual: true,
        });
        return {
          zoneId: zone.id,
          companyId: zoneCompanyId(zone),
          query,
          outcome: "FAILED",
          errorMessage,
        };
      }

      const updated = await persistGeocode({
        centroidLatitude: null,
        centroidLongitude: null,
        geocodingStatus: "FAILED",
        geocodingSource: "AUTO",
        geocodedAt: null,
        geocodingLastError: errorMessage,
      });

      if (!updated) {
        return skippedWriteResult();
      }

      console.info(`${LOG_PREFIX} LOCATION_ZONE_GEOCODING_FAILED`, {
        event: "LOCATION_ZONE_GEOCODING_FAILED",
        zoneId: zone.id,
        companyId: zoneCompanyId(zone),
        query,
        status: result.status,
        errorMessage,
      });

      return {
        zoneId: zone.id,
        companyId: zoneCompanyId(zone),
        query,
        outcome: "FAILED",
        errorMessage,
        zone: updated,
      };
    }

    const updated = await persistGeocode({
      centroidLatitude: result.latitude,
      centroidLongitude: result.longitude,
      geocodingStatus: "RESOLVED",
      geocodingSource: "AUTO",
      geocodedAt: new Date(),
      geocodingLastError: null,
    });

    if (!updated) {
      return skippedWriteResult();
    }

    console.info(`${LOG_PREFIX} LOCATION_ZONE_GEOCODING_RESOLVED`, {
      event: "LOCATION_ZONE_GEOCODING_RESOLVED",
      zoneId: zone.id,
      companyId: zoneCompanyId(zone),
      query,
    });

    return {
      zoneId: zone.id,
      companyId: zoneCompanyId(zone),
      query,
      outcome: "RESOLVED",
      zone: updated,
    };
  },

  /**
   * Best-effort fire-and-forget geocode after create / name change.
   * Not durable across process crashes — CLI backfill recovers PENDING rows.
   */
  scheduleGeocode(zone: LocationZone): void {
    setImmediate(() => {
      void this.geocodeZone(zone).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_PREFIX} LOCATION_ZONE_GEOCODING_FAILED`, {
          event: "LOCATION_ZONE_GEOCODING_FAILED",
          zoneId: zone.id,
          companyId: zoneCompanyId(zone),
          errorMessage: truncateError(message),
        });
      });
    });
  },

  async backfill(options: {
    companyId?: string;
    dryRun?: boolean;
    delayMs?: number;
    includeFailed?: boolean;
  } = {}): Promise<LocationZoneGeocodeBatchSummary> {
    const delayMs = options.delayMs ?? 250;
    const eligible = await locationZoneRepository.listEligibleForGeocoding({
      companyId: options.companyId,
      includeFailed: options.includeFailed,
    });

    const summary: LocationZoneGeocodeBatchSummary = {
      total: eligible.length,
      resolved: 0,
      failed: 0,
      skipped: 0,
      manualSkipped: 0,
      alreadyResolved: 0,
      noApiKeySkipped: 0,
      staleSkipped: 0,
    };

    if (options.dryRun) {
      summary.skipped = eligible.length;
      return summary;
    }

    const apiKey = resolveGoogleMapsApiKey().key;

    for (const zone of eligible) {
      try {
        const attempt = await this.geocodeZone(zone, {
          apiKey,
          delayBeforeMs: delayMs,
        });

        switch (attempt.outcome) {
          case "RESOLVED":
            summary.resolved += 1;
            break;
          case "FAILED":
            summary.failed += 1;
            break;
          case "SKIPPED_MANUAL":
          case "SKIPPED_CONCURRENT_MANUAL":
            summary.manualSkipped += 1;
            summary.skipped += 1;
            break;
          case "SKIPPED_STALE_INPUT":
          case "SKIPPED_NOT_FOUND":
            summary.staleSkipped += 1;
            summary.skipped += 1;
            break;
          case "SKIPPED_ALREADY_RESOLVED":
            summary.alreadyResolved += 1;
            summary.skipped += 1;
            break;
          case "SKIPPED_NO_API_KEY":
            summary.noApiKeySkipped += 1;
            summary.skipped += 1;
            break;
          default:
            summary.skipped += 1;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${LOG_PREFIX} LOCATION_ZONE_GEOCODING_FAILED`, {
          event: "LOCATION_ZONE_GEOCODING_FAILED",
          reason: "UNEXPECTED",
          zoneId: zone.id,
          companyId: zoneCompanyId(zone),
          errorMessage: truncateError(message),
        });
        summary.failed += 1;
      }
    }

    return summary;
  },
};
