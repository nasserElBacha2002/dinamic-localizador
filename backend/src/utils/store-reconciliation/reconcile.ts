import { calculateDistanceMeters } from "../haversine";
import { compareAddresses } from "./address";
import {
  buildGeocodeQuery,
  resolveGeocodedCoordinates,
  toGeocodingDiagnostics,
  type GeocodeCache,
} from "./geocoding";
import { normalizeStoreNumber } from "./store-number";
import type {
  CoordinateStatus,
  DatabaseStore,
  DuplicateStoreReport,
  GeocodingDiagnostics,
  OfficialStore,
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
  databaseStore: DatabaseStore,
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

  if (databaseStore.latitude === null || databaseStore.longitude === null) {
    return {
      coordinateStatus: "missing_coordinates",
      coordinateDistanceMeters: null,
    };
  }

  const distance = calculateDistanceMeters(
    databaseStore.latitude,
    databaseStore.longitude,
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
  officialByNumber: Map<string, OfficialStore[]>,
  databaseByNumber: Map<string, DatabaseStore[]>,
  rowByStoreAndDbId: Map<string, ReconciliationRow>,
): DuplicateStoreReport[] => {
  const duplicates: DuplicateStoreReport[] = [];

  for (const [storeNumber, stores] of officialByNumber.entries()) {
    if (stores.length <= 1) {
      continue;
    }

    for (const store of stores) {
      duplicates.push({
        source: "official",
        storeNumber,
        duplicateCount: stores.length,
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
        officialAddress: store.officialAddress,
        details: `raw_store_id=${store.rawStoreId}`,
      });
    }
  }

  for (const [storeNumber, stores] of databaseByNumber.entries()) {
    if (stores.length <= 1) {
      continue;
    }

    const official = officialByNumber.get(storeNumber)?.[0];
    for (const store of stores) {
      const matchedRow = rowByStoreAndDbId.get(`${storeNumber}:${store.id}`);
      const addressComparison = official
        ? compareAddresses(official.officialAddress, store.address)
        : null;

      duplicates.push({
        source: "database",
        storeNumber,
        duplicateCount: stores.length,
        dbId: store.id,
        dbAddress: store.address,
        googlePlaceId: store.googlePlaceId,
        latitude: store.latitudeRaw,
        longitude: store.longitudeRaw,
        createdAt: store.createdAt,
        updatedAt: store.updatedAt,
        active: store.active,
        addressMatchesOfficial: addressComparison?.status ?? "",
        coordinateStatus: matchedRow?.coordinateStatus ?? "",
        officialAddress: official?.officialAddress ?? "",
        details: `duplicate_db_ids=${stores.map((entry) => entry.id).join(",")}`,
      });
    }
  }

  return duplicates.sort((left, right) => {
    const byStore = left.storeNumber.localeCompare(right.storeNumber, "es", { numeric: true });
    if (byStore !== 0) {
      return byStore;
    }

    return left.dbId.localeCompare(right.dbId);
  });
};

const buildStats = (
  summary: ReconciliationRow[],
  duplicateGroups: number,
  totalOfficialRows: number,
  totalUniqueOfficialStoreNumbers: number,
  totalDatabaseRows: number,
  numericDatabaseStores: number,
  ignoredNonNumericDatabaseRows: number,
): ReconciliationStats => {
  const matchedRows = summary.filter((row) => row.status === "matched");

  return {
    totalOfficialRows,
    totalUniqueOfficialStoreNumbers,
    totalDatabaseRows,
    numericDatabaseStores,
    ignoredNonNumericDatabaseRows,
    matchedStores: matchedRows.length,
    missingInDatabase: summary.filter((row) => row.status === "missing_in_database").length,
    extraInDatabase: summary.filter((row) => row.status === "extra_in_database").length,
    duplicateStoreNumberGroups: duplicateGroups,
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
  storeNumber: string,
  status: ReconciliationRow["status"],
): ReconciliationRow => ({
  storeNumber,
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

export const reconcileStores = async (
  officialStores: OfficialStore[],
  databaseStores: DatabaseStore[],
  options: ReconcileOptions,
  geocodeCache: GeocodeCache,
  geocodeCachePath: string,
  googleMapsApiKey: string | null,
): Promise<ReconciliationResult> => {
  const ignoredDatabaseStores = databaseStores.filter((store) => !normalizeStoreNumber(store.name));
  const numericDatabaseStores = databaseStores.filter((store) => normalizeStoreNumber(store.name));

  const officialByNumber = new Map<string, OfficialStore[]>();
  for (const store of officialStores) {
    const bucket = officialByNumber.get(store.storeNumber) ?? [];
    bucket.push(store);
    officialByNumber.set(store.storeNumber, bucket);
  }

  const databaseByNumber = new Map<string, DatabaseStore[]>();
  for (const store of numericDatabaseStores) {
    const storeNumber = normalizeStoreNumber(store.name);
    if (!storeNumber) {
      continue;
    }

    const bucket = databaseByNumber.get(storeNumber) ?? [];
    bucket.push(store);
    databaseByNumber.set(storeNumber, bucket);
  }

  const summary: ReconciliationRow[] = [];
  const rowByStoreAndDbId = new Map<string, ReconciliationRow>();
  const officialNumbers = new Set(officialByNumber.keys());
  const databaseNumbers = new Set(databaseByNumber.keys());

  for (const storeNumber of [...officialNumbers].sort((left, right) =>
    left.localeCompare(right, "es", { numeric: true }),
  )) {
    const official = officialByNumber.get(storeNumber)?.[0];
    if (!official) {
      continue;
    }

    const databaseMatches = databaseByNumber.get(storeNumber) ?? [];
    if (databaseMatches.length === 0) {
      summary.push({
        ...createBaseRow(storeNumber, "missing_in_database"),
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

    for (const databaseStore of databaseMatches) {
      const addressComparison = compareAddresses(
        official.officialAddress,
        databaseStore.address,
        options.likelyMatchThreshold,
      );

      const coordinateEvaluation = evaluateCoordinateStatus(
        databaseStore,
        geocodingDiagnostics,
        options,
      );

      const notes: string[] = [];
      if (databaseMatches.length > 1) {
        notes.push(
          `duplicate_db_rows: ${databaseMatches.map((store) => store.id).join(", ")}`,
        );
      }

      if ((officialByNumber.get(storeNumber)?.length ?? 0) > 1) {
        notes.push("duplicate_official_rows");
      }

      const row: ReconciliationRow = {
        storeNumber,
        status: "matched",
        carrefourOfficialAddress: official.officialAddress,
        dbAddress: databaseStore.address,
        addressMatchStatus: addressComparison.status,
        addressSimilarity: addressComparison.similarity,
        normalizedOfficialAddress: addressComparison.normalizedOfficialAddress,
        normalizedDbAddress: addressComparison.normalizedDbAddress,
        addressDifferenceReason: addressComparison.addressDifferenceReason,
        dbLatitude: databaseStore.latitudeRaw,
        dbLongitude: databaseStore.longitudeRaw,
        coordinateDistanceMeters: coordinateEvaluation.coordinateDistanceMeters,
        coordinateStatus: coordinateEvaluation.coordinateStatus,
        ...buildRowGeocodingFields(geocodingDiagnostics),
        dbId: databaseStore.id,
        notes: notes.join("; "),
      };

      summary.push(row);
      rowByStoreAndDbId.set(`${storeNumber}:${databaseStore.id}`, row);
    }
  }

  for (const storeNumber of [...databaseNumbers].sort((left, right) =>
    left.localeCompare(right, "es", { numeric: true }),
  )) {
    if (officialNumbers.has(storeNumber)) {
      continue;
    }

    const databaseMatches = databaseByNumber.get(storeNumber) ?? [];
    for (const databaseStore of databaseMatches) {
      summary.push({
        ...createBaseRow(storeNumber, "extra_in_database"),
        dbAddress: databaseStore.address,
        dbLatitude: databaseStore.latitudeRaw,
        dbLongitude: databaseStore.longitudeRaw,
        dbId: databaseStore.id,
        notes: "Present in database export but missing from Carrefour official CSV",
      });
    }
  }

  const duplicateGroups =
    [...officialByNumber.entries()].filter(([, stores]) => stores.length > 1).length +
    [...databaseByNumber.entries()].filter(([, stores]) => stores.length > 1).length;

  const duplicates = buildDuplicateReports(officialByNumber, databaseByNumber, rowByStoreAndDbId);
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
    officialStores.length,
    officialByNumber.size,
    databaseStores.length,
    numericDatabaseStores.length,
    ignoredDatabaseStores.length,
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

export const getIgnoredDatabaseStoreNames = (databaseStores: DatabaseStore[]): string[] =>
  databaseStores
    .filter((store) => !normalizeStoreNumber(store.name))
    .map((store) => store.name)
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
