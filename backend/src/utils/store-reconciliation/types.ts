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
  neighborhood: string;
  locality: string;
  storeFormat: string;
  active: string;
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

export interface ReconciliationRow {
  storeNumber: string;
  status: ReconciliationStatus;
  carrefourOfficialAddress: string;
  dbAddress: string;
  addressMatchStatus: AddressMatchStatus | "";
  addressSimilarity: number | null;
  dbLatitude: number | null;
  dbLongitude: number | null;
  geocodedLatitude: number | null;
  geocodedLongitude: number | null;
  coordinateDistanceMeters: number | null;
  coordinateStatus: CoordinateStatus | "";
  dbId: string;
  notes: string;
}

export interface DuplicateStoreReport {
  source: "official" | "database";
  storeNumber: string;
  duplicateCount: number;
  details: string;
}

export interface ReconciliationStats {
  totalOfficialStores: number;
  totalDatabaseStores: number;
  numericDatabaseStores: number;
  ignoredNonNumericDatabaseRows: number;
  missingInDatabase: number;
  extraInDatabase: number;
  addressMismatches: number;
  coordinateMismatches: number;
  duplicateCount: number;
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
