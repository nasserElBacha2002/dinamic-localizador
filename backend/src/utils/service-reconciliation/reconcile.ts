import { calculateDistanceMeters } from "../haversine";
import { compareAddresses } from "./address";
import {
  buildGeocodeQuery,
  resolveGeocodedCoordinates,
  toGeocodingDiagnostics,
  type GeocodeCache,
} from "./geocoding";
import { normalizeServiceNumber } from "./service-number";
import type {
  CoordinateStatus,
  DatabaseService,
  DuplicateServiceReport,
  GeocodingDiagnostics,
  OfficialService,
  ReconcileOptions,
  ReconciliationResult,
  ReconciliationRow,
  ReconciliationStats,
} from "./types";
import {
  MISSING_API_KEY_ERROR_CODE,
  MISSING_API_KEY_ERROR_MESSAGE,
} from "./types";

const emptyGeocodingDiagnostics = (): GeocodingDiagnostics => ({
  status: "",
  errorCode: "",
  errorMessage: "",
  query: "",
  latitude: null,
  longitude: null,
});

const skippedGeocodingDiagnostics = (query = ""): GeocodingDiagnostics => ({
  status: "skipped",
  errorCode: MISSING_API_KEY_ERROR_CODE,
  errorMessage: MISSING_API_KEY_ERROR_MESSAGE,
  query,
  latitude: null,
  longitude: null,
});

const buildRowGeocodingFields = (diagnostics: GeocodingDiagnostics) => ({
  geocodingStatus: diagnostics.status,
  geocodingErrorCode: diagnostics.errorCode,
  geocodingErrorMessage: diagnostics.errorMessage,
  geocodingQuery: diagnostics.query,
  geocodedLatitude:
    diagnostics.latitude === null ? "" : String(diagnostics.latitude),
  geocodedLongitude:
    diagnostics.longitude === null ? "" : String(diagnostics.longitude),
});

const evaluateCoordinateStatus = (
  databaseService: DatabaseService,
  diagnostics: GeocodingDiagnostics,
  options: ReconcileOptions,
): {
  coordinateStatus: CoordinateStatus | "";
  coordinateDistanceMeters: number | null;
} => {
  if (!options.geocodingEnabled) {
    return {
      coordinateStatus: "geocoding_skipped",
      coordinateDistanceMeters: null,
    };
  }

  if (diagnostics.status === "skipped") {
    return {
      coordinateStatus: "geocoding_skipped",
      coordinateDistanceMeters: null,
    };
  }

  if (diagnostics.status !== "OK") {
    return {
      coordinateStatus: "geocoding_failed",
      coordinateDistanceMeters: null,
    };
  }

  if (databaseService.latitude === null || databaseService.longitude === null) {
    return {
      coordinateStatus: "missing_coordinates",
      coordinateDistanceMeters: null,
    };
  }

  const distance = calculateDistanceMeters(
    databaseService.latitude,
    databaseService.longitude,
    diagnostics.latitude!,
    diagnostics.longitude!,
  );

  let coordinateStatus: CoordinateStatus = "mismatch";
  if (distance <= options.coordinateOkMeters) {
    coordinateStatus = "ok";
  } else if (distance <= options.coordinateReviewMeters) {
    coordinateStatus = "review";
  }

  return {
    coordinateStatus,
    coordinateDistanceMeters: distance,
  };
};

const buildDuplicateReports = (
  officialByNumber: Map<string, OfficialService[]>,
  databaseByNumber: Map<string, DatabaseService[]>,
  rowByServiceAndDbId: Map<string, ReconciliationRow>,
): DuplicateServiceReport[] => {
  const duplicates: DuplicateServiceReport[] = [];

  for (const [serviceNumber, services] of officialByNumber.entries()) {
    if (services.length <= 1) {
      continue;
    }

    for (const service of services) {
      duplicates.push({
        source: "official",
        serviceNumber,
        duplicateCount: services.length,
        dbId: "",
        dbAddress: "",
        googlePlaceId: "",
        latitude: "",
        longitude: "",
        createdAt: "",
        updatedAt: "",
        active: "",
        addressMatchesOfficial: "",
        coordinateStatus: "",
        officialAddress: service.officialAddress,
        details: `raw_store_id=${service.rawStoreId}`,
      });
    }
  }

  for (const [serviceNumber, services] of databaseByNumber.entries()) {
    if (services.length <= 1) {
      continue;
    }

    const official = officialByNumber.get(serviceNumber)?.[0];
    for (const service of services) {
      const matchedRow = rowByServiceAndDbId.get(`${serviceNumber}:${service.id}`);
      const addressComparison = official
        ? compareAddresses(official.officialAddress, service.address)
        : null;

      duplicates.push({
        source: "database",
        serviceNumber,
        duplicateCount: services.length,
        dbId: service.id,
        dbAddress: service.address,
        googlePlaceId: service.googlePlaceId,
        latitude: service.latitudeRaw,
        longitude: service.longitudeRaw,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
        active: service.active,
        addressMatchesOfficial: addressComparison?.status ?? "",
        coordinateStatus: matchedRow?.coordinateStatus ?? "",
        officialAddress: official?.officialAddress ?? "",
        details: `duplicate_db_ids=${services.map((entry) => entry.id).join(",")}`,
      });
    }
  }

  return duplicates.sort((left, right) => {
    const byService = left.serviceNumber.localeCompare(right.serviceNumber, "es", { numeric: true });
    if (byService !== 0) {
      return byService;
    }

    return left.dbId.localeCompare(right.dbId);
  });
};

const buildStats = (
  summary: ReconciliationRow[],
  duplicateGroups: number,
  totalOfficialRows: number,
  totalUniqueOfficialServiceNumbers: number,
  totalDatabaseRows: number,
  numericDatabaseServices: number,
  ignoredNonNumericDatabaseRows: number,
): ReconciliationStats => {
  const matchedRows = summary.filter((row) => row.status === "matched");

  return {
    totalOfficialRows,
    totalUniqueOfficialServiceNumbers,
    totalDatabaseRows,
    numericDatabaseServices,
    ignoredNonNumericDatabaseRows,
    matchedServices: matchedRows.length,
    missingInDatabase: summary.filter((row) => row.status === "missing_in_database").length,
    extraInDatabase: summary.filter((row) => row.status === "extra_in_database").length,
    duplicateServiceNumberGroups: duplicateGroups,
    addressExactMatches: matchedRows.filter((row) => row.addressMatchStatus === "exact_match").length,
    addressLikelyMatches: matchedRows.filter((row) => row.addressMatchStatus === "likely_match").length,
    addressMismatches: matchedRows.filter((row) => row.addressMatchStatus === "mismatch").length,
    geocodingOkCount: matchedRows.filter((row) => row.geocodingStatus === "OK").length,
    geocodingSkippedCount: matchedRows.filter((row) => row.coordinateStatus === "geocoding_skipped")
      .length,
    geocodingFailedCount: matchedRows.filter((row) => row.coordinateStatus === "geocoding_failed")
      .length,
    coordinateOkCount: matchedRows.filter((row) => row.coordinateStatus === "ok").length,
    coordinateReviewCount: matchedRows.filter((row) => row.coordinateStatus === "review").length,
    coordinateMismatchCount: matchedRows.filter((row) => row.coordinateStatus === "mismatch").length,
    missingCoordinatesCount: matchedRows.filter((row) => row.coordinateStatus === "missing_coordinates")
      .length,
  };
};

const createBaseRow = (
  serviceNumber: string,
  status: ReconciliationRow["status"],
): ReconciliationRow => ({
  serviceNumber,
  status,
  carrefourOfficialAddress: "",
  dbAddress: "",
  addressMatchStatus: "",
  addressSimilarity: null,
  normalizedOfficialAddress: "",
  normalizedDbAddress: "",
  addressDifferenceReason: "",
  dbLatitude: "",
  dbLongitude: "",
  geocodedLatitude: "",
  geocodedLongitude: "",
  coordinateDistanceMeters: null,
  coordinateStatus: "",
  geocodingStatus: "",
  geocodingErrorCode: "",
  geocodingErrorMessage: "",
  geocodingQuery: "",
  dbId: "",
  notes: "",
});

export const reconcileServices = async (
  officialServices: OfficialService[],
  databaseServices: DatabaseService[],
  options: ReconcileOptions,
  geocodeCache: GeocodeCache,
  geocodeCachePath: string,
  googleMapsApiKey: string | null,
): Promise<ReconciliationResult> => {
  const ignoredDatabaseServices = databaseServices.filter((service) => !normalizeServiceNumber(service.name));
  const numericDatabaseServices = databaseServices.filter((service) => normalizeServiceNumber(service.name));

  const officialByNumber = new Map<string, OfficialService[]>();
  for (const service of officialServices) {
    const bucket = officialByNumber.get(service.serviceNumber) ?? [];
    bucket.push(service);
    officialByNumber.set(service.serviceNumber, bucket);
  }

  const databaseByNumber = new Map<string, DatabaseService[]>();
  for (const service of numericDatabaseServices) {
    const serviceNumber = normalizeServiceNumber(service.name);
    if (!serviceNumber) {
      continue;
    }

    const bucket = databaseByNumber.get(serviceNumber) ?? [];
    bucket.push(service);
    databaseByNumber.set(serviceNumber, bucket);
  }

  const summary: ReconciliationRow[] = [];
  const rowByServiceAndDbId = new Map<string, ReconciliationRow>();
  const officialNumbers = new Set(officialByNumber.keys());
  const databaseNumbers = new Set(databaseByNumber.keys());

  for (const serviceNumber of [...officialNumbers].sort((left, right) =>
    left.localeCompare(right, "es", { numeric: true }),
  )) {
    const official = officialByNumber.get(serviceNumber)?.[0];
    if (!official) {
      continue;
    }

    const databaseMatches = databaseByNumber.get(serviceNumber) ?? [];
    if (databaseMatches.length === 0) {
      summary.push({
        ...createBaseRow(serviceNumber, "missing_in_database"),
        carrefourOfficialAddress: official.officialAddress,
        notes: "Present in Carrefour official CSV but missing from database export",
      });
      continue;
    }

    let geocodingDiagnostics: GeocodingDiagnostics = options.geocodingEnabled
      ? emptyGeocodingDiagnostics()
      : skippedGeocodingDiagnostics(buildGeocodeQuery(official));

    if (options.geocodingEnabled && googleMapsApiKey) {
      const geocoded = await resolveGeocodedCoordinates(
        official,
        googleMapsApiKey,
        geocodeCache,
        geocodeCachePath,
        options.geocodeDelayMs,
      );
      geocodingDiagnostics = toGeocodingDiagnostics(geocoded);
    } else if (!googleMapsApiKey) {
      geocodingDiagnostics = skippedGeocodingDiagnostics(buildGeocodeQuery(official));
    }

    for (const databaseService of databaseMatches) {
      const addressComparison = compareAddresses(
        official.officialAddress,
        databaseService.address,
        options.likelyMatchThreshold,
      );

      const coordinateEvaluation = evaluateCoordinateStatus(
        databaseService,
        geocodingDiagnostics,
        options,
      );

      const notes: string[] = [];
      if (databaseMatches.length > 1) {
        notes.push(
          `duplicate_db_rows: ${databaseMatches.map((service) => service.id).join(", ")}`,
        );
      }

      if ((officialByNumber.get(serviceNumber)?.length ?? 0) > 1) {
        notes.push("duplicate_official_rows");
      }

      const row: ReconciliationRow = {
        serviceNumber,
        status: "matched",
        carrefourOfficialAddress: official.officialAddress,
        dbAddress: databaseService.address,
        addressMatchStatus: addressComparison.status,
        addressSimilarity: addressComparison.similarity,
        normalizedOfficialAddress: addressComparison.normalizedOfficialAddress,
        normalizedDbAddress: addressComparison.normalizedDbAddress,
        addressDifferenceReason: addressComparison.addressDifferenceReason,
        dbLatitude: databaseService.latitudeRaw,
        dbLongitude: databaseService.longitudeRaw,
        coordinateDistanceMeters: coordinateEvaluation.coordinateDistanceMeters,
        coordinateStatus: coordinateEvaluation.coordinateStatus,
        ...buildRowGeocodingFields(geocodingDiagnostics),
        dbId: databaseService.id,
        notes: notes.join("; "),
      };

      summary.push(row);
      rowByServiceAndDbId.set(`${serviceNumber}:${databaseService.id}`, row);
    }
  }

  for (const serviceNumber of [...databaseNumbers].sort((left, right) =>
    left.localeCompare(right, "es", { numeric: true }),
  )) {
    if (officialNumbers.has(serviceNumber)) {
      continue;
    }

    const databaseMatches = databaseByNumber.get(serviceNumber) ?? [];
    for (const databaseService of databaseMatches) {
      summary.push({
        ...createBaseRow(serviceNumber, "extra_in_database"),
        dbAddress: databaseService.address,
        dbLatitude: databaseService.latitudeRaw,
        dbLongitude: databaseService.longitudeRaw,
        dbId: databaseService.id,
        notes: "Present in database export but missing from Carrefour official CSV",
      });
    }
  }

  const duplicateGroups =
    [...officialByNumber.entries()].filter(([, services]) => services.length > 1).length +
    [...databaseByNumber.entries()].filter(([, services]) => services.length > 1).length;

  const duplicates = buildDuplicateReports(officialByNumber, databaseByNumber, rowByServiceAndDbId);
  const missingInDatabase = summary.filter((row) => row.status === "missing_in_database");
  const extraInDatabase = summary.filter((row) => row.status === "extra_in_database");
  const addressMismatches = summary.filter(
    (row) => row.addressMatchStatus === "mismatch" || row.addressMatchStatus === "likely_match",
  );
  const coordinateMismatches = summary.filter((row) =>
    ["review", "mismatch", "missing_coordinates", "geocoding_failed", "geocoding_skipped"].includes(
      row.coordinateStatus,
    ),
  );

  const stats = buildStats(
    summary,
    duplicateGroups,
    officialServices.length,
    officialByNumber.size,
    databaseServices.length,
    numericDatabaseServices.length,
    ignoredDatabaseServices.length,
  );

  return {
    summary,
    missingInDatabase,
    extraInDatabase,
    duplicates,
    addressMismatches,
    coordinateMismatches,
    stats,
  };
};

export const getIgnoredDatabaseServiceNames = (databaseServices: DatabaseService[]): string[] =>
  databaseServices
    .filter((service) => !normalizeServiceNumber(service.name))
    .map((service) => service.name)
    .sort((left, right) => left.localeCompare(right, "es"));

export const countMatchedGeocodingFailures = (summary: ReconciliationRow[]): number =>
  summary.filter(
    (row) => row.status === "matched" && row.coordinateStatus === "geocoding_failed",
  ).length;

export const countMatchedGeocodingAttempts = (summary: ReconciliationRow[]): number =>
  summary.filter(
    (row) =>
      row.status === "matched" &&
      row.geocodingStatus !== "" &&
      row.geocodingStatus !== "skipped",
  ).length;
