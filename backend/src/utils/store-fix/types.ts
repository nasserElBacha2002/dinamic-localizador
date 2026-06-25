export type FixType =
  | "AUTO_FIX_COORDINATE"
  | "CRITICAL_COORDINATE_FIX"
  | "REVIEW_COORDINATE_FIX"
  | "AUTO_FIX_ADDRESS"
  | "INSERT_MISSING"
  | "DEACTIVATE_DUPLICATE"
  | "RENAME_NONNUMERIC"
  | "DEACTIVATE_EXTRA";

export type FixConfidence = "high" | "medium" | "low";

export interface ReconciliationReportRow {
  storeNumber: string;
  status: string;
  carrefourOfficialAddress: string;
  dbAddress: string;
  addressMatchStatus: string;
  addressSimilarity: string;
  normalizedOfficialAddress: string;
  normalizedDbAddress: string;
  addressDifferenceReason: string;
  dbLatitude: string;
  dbLongitude: string;
  geocodedLatitude: string;
  geocodedLongitude: string;
  coordinateDistanceMeters: string;
  coordinateStatus: string;
  geocodingStatus: string;
  geocodingErrorCode: string;
  geocodingErrorMessage: string;
  geocodingQuery: string;
  dbId: string;
  notes: string;
}

export interface DuplicateReportRow {
  source: string;
  storeNumber: string;
  duplicateCount: string;
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

export interface ProposedFix {
  storeNumber: string;
  dbId: string;
  fixType: FixType;
  oldAddress: string;
  newAddress: string;
  oldLatitude: string;
  oldLongitude: string;
  newLatitude: string;
  newLongitude: string;
  distanceMeters: number | null;
  confidence: FixConfidence;
  applyByDefault: boolean;
  reason: string;
  sqlComment: string;
}

export interface SkippedFix {
  storeNumber: string;
  dbId: string;
  skippedReason: string;
  details: string;
}

export interface DuplicateResolutionRow {
  storeNumber: string;
  dbId: string;
  address: string;
  latitude: string;
  longitude: string;
  coordinateDistanceMeters: string;
  addressMatchStatus: string;
  recommendation: "keep" | "deactivate" | "review";
  reason: string;
}

export interface MissingInsertPlanRow {
  storeNumber: string;
  officialAddress: string;
  neighborhood: string;
  locality: string;
  latitude: string;
  longitude: string;
  canInsert: boolean;
  reason: string;
}

export interface FixPlanSummary {
  totalCoordinateUpdatesProposed: number;
  totalAddressUpdatesProposed: number;
  totalMissingInsertCandidates: number;
  totalDuplicateGroups: number;
  totalDuplicateDeactivationCandidates: number;
  totalSkipped: number;
  totalApplyDefault: number;
  generatedAt: string;
  nodeEnv?: string;
  dbName?: string;
  dbHost?: string;
}

export interface CurrentDbStore {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  allowedRadiusMeters: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  googlePlaceId: string | null;
  neighborhood: string | null;
  locality: string | null;
  storeFormat: string | null;
}

export interface CurrentDbState {
  stores: CurrentDbStore[];
  byStoreNumber: Map<string, CurrentDbStore[]>;
  nonNumericStores: CurrentDbStore[];
  duplicateNumericGroups: Map<string, CurrentDbStore[]>;
}

export interface StoresSchema {
  tableName: string;
  neighborhoodColumn: string | null;
  localityColumn: string | null;
  storeFormatColumn: string | null;
  availableColumns: Set<string>;
}

export interface EnvironmentSnapshot {
  nodeEnv: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  tableName: string;
  totalCurrentDbRows: number;
  totalNumericCurrentDbStores: number;
  totalNonNumericCurrentDbRows: number;
  duplicateNumericStoreGroups: number;
  generatedAt: string;
}

export interface FixPlan {
  proposed: ProposedFix[];
  skipped: SkippedFix[];
  duplicateResolution: DuplicateResolutionRow[];
  missingInserts: MissingInsertPlanRow[];
  missingRequiresCoordinates: MissingInsertPlanRow[];
  summary: FixPlanSummary;
  environmentSnapshot: EnvironmentSnapshot;
}

export interface FixPlanOptions {
  includeReviewCoordinates: boolean;
  fixAddresses: boolean;
  insertMissing: boolean;
  deactivateDuplicates: boolean;
  deactivateExtra: boolean;
  fixNonnumericNames: boolean;
}
