export interface OfficialStore {
  storeNumber: string;
  rawStoreId: string;
  officialAddress: string;
  neighborhood: string;
  locality: string;
}

export interface DatabaseStore {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  latitudeRaw: string;
  longitudeRaw: string;
  neighborhood: string;
  locality: string;
  storeFormat: string;
  active: string;
  googlePlaceId: string;
  createdAt: string;
  updatedAt: string;
  raw: Record<string, string>;
}

export type AddressMatchStatus = "exact_match" | "likely_match" | "mismatch";

export type CoordinateStatus =
  | "ok"
  | "review"
  | "mismatch"
  | "missing_coordinates"
  | "geocoding_failed"
  | "geocoding_skipped";

export type ReconciliationStatus = "matched" | "missing_in_database" | "extra_in_database";

export interface GeocodingDiagnostics {
  status: string;
  errorCode: string;
  errorMessage: string;
  query: string;
  latitude: number | null;
  longitude: number | null;
}

export interface ReconciliationRow {
  storeNumber: string;
  status: ReconciliationStatus;
  carrefourOfficialAddress: string;
  dbAddress: string;
  addressMatchStatus: AddressMatchStatus | "";
  addressSimilarity: number | null;
  normalizedOfficialAddress: string;
  normalizedDbAddress: string;
  addressDifferenceReason: string;
  dbLatitude: string;
  dbLongitude: string;
  geocodedLatitude: string;
  geocodedLongitude: string;
  coordinateDistanceMeters: number | null;
  coordinateStatus: CoordinateStatus | "";
  geocodingStatus: string;
  geocodingErrorCode: string;
  geocodingErrorMessage: string;
  geocodingQuery: string;
  dbId: string;
  notes: string;
}

export interface DuplicateStoreReport {
  source: "official" | "database";
  storeNumber: string;
  duplicateCount: number;
  dbId: string;
  dbAddress: string;
  googlePlaceId: string;
  latitude: string;
  longitude: string;
  createdAt: string;
  updatedAt: string;
  active: string;
  addressMatchesOfficial: string;
  coordinateStatus: string;
  officialAddress: string;
  details: string;
}

export interface ReconciliationStats {
  totalOfficialRows: number;
  totalUniqueOfficialStoreNumbers: number;
  totalDatabaseRows: number;
  numericDatabaseStores: number;
  ignoredNonNumericDatabaseRows: number;
  matchedStores: number;
  missingInDatabase: number;
  extraInDatabase: number;
  duplicateStoreNumberGroups: number;
  addressExactMatches: number;
  addressLikelyMatches: number;
  addressMismatches: number;
  geocodingOkCount: number;
  geocodingSkippedCount: number;
  geocodingFailedCount: number;
  coordinateOkCount: number;
  coordinateReviewCount: number;
  coordinateMismatchCount: number;
  missingCoordinatesCount: number;
}

export interface ReconciliationResult {
  summary: ReconciliationRow[];
  missingInDatabase: ReconciliationRow[];
  extraInDatabase: ReconciliationRow[];
  duplicates: DuplicateStoreReport[];
  addressMismatches: ReconciliationRow[];
  coordinateMismatches: ReconciliationRow[];
  stats: ReconciliationStats;
}

export interface ReconcileOptions {
  likelyMatchThreshold: number;
  coordinateOkMeters: number;
  coordinateReviewMeters: number;
  geocodingEnabled: boolean;
  geocodeDelayMs: number;
}

export const MISSING_API_KEY_ERROR_CODE = "missing_api_key";
export const MISSING_API_KEY_ERROR_MESSAGE =
  "GOOGLE_MAPS_API_KEY is not configured";
