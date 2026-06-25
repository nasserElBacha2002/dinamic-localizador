import { calculateDistanceMeters } from "../haversine";
import { compareAddresses } from "./address";
import { resolveGeocodedCoordinates } from "./geocoding";
import { normalizeStoreNumber } from "./store-number";
import type {
  CoordinateStatus,
  DatabaseStore,
  DuplicateStoreReport,
  OfficialStore,
  ReconcileOptions,
  ReconciliationResult,
  ReconciliationRow,
  ReconciliationStats,
} from "./types";
import type { GeocodeCache } from "./geocoding";

const buildDuplicateReports = (
  officialByNumber: Map<string, OfficialStore[]>,
  databaseByNumber: Map<string, DatabaseStore[]>,
): DuplicateStoreReport[] => {
  const duplicates: DuplicateStoreReport[] = [];

  for (const [storeNumber, stores] of officialByNumber.entries()) {
    if (stores.length <= 1) {
      continue;
    }

    duplicates.push({
      source: "official",
      storeNumber,
      duplicateCount: stores.length,
      details: stores
        .map((store) => `${store.rawStoreId}: ${store.officialAddress}`)
        .join(" | "),
    });
  }

  for (const [storeNumber, stores] of databaseByNumber.entries()) {
    if (stores.length <= 1) {
      continue;
    }

    duplicates.push({
      source: "database",
      storeNumber,
      duplicateCount: stores.length,
      details: stores.map((store) => `${store.id}: ${store.address}`).join(" | "),
    });
  }

  return duplicates.sort((left, right) => left.storeNumber.localeCompare(right.storeNumber, "es"));
};

const evaluateCoordinateStatus = (
  dbLatitude: number | null,
  dbLongitude: number | null,
  geocodedLatitude: number | null,
  geocodedLongitude: number | null,
  geocodingResult: "failed" | "skipped" | "ok",
  options: ReconcileOptions,
): {
  coordinateStatus: CoordinateStatus;
  coordinateDistanceMeters: number | null;
  geocodedLatitude: number | null;
  geocodedLongitude: number | null;
} => {
  if (geocodingResult === "skipped") {
    return {
      coordinateStatus: "geocoding_skipped",
      coordinateDistanceMeters: null,
      geocodedLatitude: null,
      geocodedLongitude: null,
    };
  }

  if (geocodingResult === "failed") {
    return {
      coordinateStatus: "geocoding_failed",
      coordinateDistanceMeters: null,
      geocodedLatitude: null,
      geocodedLongitude: null,
    };
  }

  if (dbLatitude === null || dbLongitude === null) {
    return {
      coordinateStatus: "missing_coordinates",
      coordinateDistanceMeters: null,
      geocodedLatitude,
      geocodedLongitude,
    };
  }

  const distance = calculateDistanceMeters(
    dbLatitude,
    dbLongitude,
    geocodedLatitude!,
    geocodedLongitude!,
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
    geocodedLatitude,
    geocodedLongitude,
  };
};

const buildStats = (
  summary: ReconciliationRow[],
  duplicates: DuplicateStoreReport[],
  totalDatabaseStores: number,
  numericDatabaseStores: number,
  ignoredNonNumericDatabaseRows: number,
  totalOfficialStores: number,
): ReconciliationStats => ({
  totalOfficialStores,
  totalDatabaseStores,
  numericDatabaseStores,
  ignoredNonNumericDatabaseRows,
  missingInDatabase: summary.filter((row) => row.status === "missing_in_database").length,
  extraInDatabase: summary.filter((row) => row.status === "extra_in_database").length,
  addressMismatches: summary.filter(
    (row) => row.addressMatchStatus === "mismatch" || row.addressMatchStatus === "likely_match",
  ).length,
  coordinateMismatches: summary.filter((row) =>
    ["review", "mismatch", "missing_coordinates", "geocoding_failed"].includes(row.coordinateStatus),
  ).length,
  duplicateCount: duplicates.length,
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

  const duplicates = buildDuplicateReports(officialByNumber, databaseByNumber);
  const summary: ReconciliationRow[] = [];

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
        storeNumber,
        status: "missing_in_database",
        carrefourOfficialAddress: official.officialAddress,
        dbAddress: "",
        addressMatchStatus: "",
        addressSimilarity: null,
        dbLatitude: null,
        dbLongitude: null,
        geocodedLatitude: null,
        geocodedLongitude: null,
        coordinateDistanceMeters: null,
        coordinateStatus: "",
        dbId: "",
        notes: "Present in Carrefour official CSV but missing from database export",
      });
      continue;
    }

    let geocodedLatitude: number | null = null;
    let geocodedLongitude: number | null = null;
    let geocodingResult: "failed" | "skipped" | "ok" = "skipped";

    if (options.geocodingEnabled && googleMapsApiKey) {
      const geocoded = await resolveGeocodedCoordinates(
        official,
        googleMapsApiKey,
        geocodeCache,
        geocodeCachePath,
        options.geocodeDelayMs,
      );

      if (geocoded === "skipped") {
        geocodingResult = "skipped";
      } else if (geocoded === "failed") {
        geocodingResult = "failed";
      } else {
        geocodingResult = "ok";
        geocodedLatitude = geocoded.latitude;
        geocodedLongitude = geocoded.longitude;
      }
    }

    for (const databaseStore of databaseMatches) {
      const addressComparison = compareAddresses(
        official.officialAddress,
        databaseStore.address,
        options.likelyMatchThreshold,
      );

      const coordinateEvaluation = evaluateCoordinateStatus(
        databaseStore.latitude,
        databaseStore.longitude,
        geocodedLatitude,
        geocodedLongitude,
        geocodingResult,
        options,
      );

      const notes: string[] = [];
      if (databaseMatches.length > 1) {
        notes.push(
          `duplicate_db_rows: ${databaseMatches.map((store) => store.id).join(", ")}`,
        );
      }

      if (officialByNumber.get(storeNumber)?.length && officialByNumber.get(storeNumber)!.length > 1) {
        notes.push("duplicate_official_rows");
      }

      summary.push({
        storeNumber,
        status: "matched",
        carrefourOfficialAddress: official.officialAddress,
        dbAddress: databaseStore.address,
        addressMatchStatus: addressComparison.status,
        addressSimilarity: addressComparison.similarity,
        dbLatitude: databaseStore.latitude,
        dbLongitude: databaseStore.longitude,
        geocodedLatitude: coordinateEvaluation.geocodedLatitude,
        geocodedLongitude: coordinateEvaluation.geocodedLongitude,
        coordinateDistanceMeters: coordinateEvaluation.coordinateDistanceMeters,
        coordinateStatus: coordinateEvaluation.coordinateStatus,
        dbId: databaseStore.id,
        notes: notes.join("; "),
      });
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
        storeNumber,
        status: "extra_in_database",
        carrefourOfficialAddress: "",
        dbAddress: databaseStore.address,
        addressMatchStatus: "",
        addressSimilarity: null,
        dbLatitude: databaseStore.latitude,
        dbLongitude: databaseStore.longitude,
        geocodedLatitude: null,
        geocodedLongitude: null,
        coordinateDistanceMeters: null,
        coordinateStatus: "",
        dbId: databaseStore.id,
        notes: "Present in database export but missing from Carrefour official CSV",
      });
    }
  }

  const missingInDatabase = summary.filter((row) => row.status === "missing_in_database");
  const extraInDatabase = summary.filter((row) => row.status === "extra_in_database");
  const addressMismatches = summary.filter(
    (row) => row.addressMatchStatus === "mismatch" || row.addressMatchStatus === "likely_match",
  );
  const coordinateMismatches = summary.filter((row) =>
    ["review", "mismatch", "missing_coordinates", "geocoding_failed"].includes(row.coordinateStatus),
  );

  const stats = buildStats(
    summary,
    duplicates,
    databaseStores.length,
    numericDatabaseStores.length,
    ignoredDatabaseStores.length,
    officialStores.length,
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
