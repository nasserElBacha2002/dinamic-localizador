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
  serviceNumber: string;
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
  serviceNumber: string;
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
  serviceNumber: string;
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
  serviceNumber: string;
  dbId: string;
  skippedReason: string;
  details: string;
}

export interface DuplicateResolutionRow {
  serviceNumber: string;
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
  serviceNumber: string;
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

export interface CurrentDbService {
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
  serviceFormat: string | null;
}

export interface CurrentDbState {
  services: CurrentDbService[];
  byServiceNumber: Map<string, CurrentDbService[]>;
  nonNumericServices: CurrentDbService[];
  duplicateNumericGroups: Map<string, CurrentDbService[]>;
}

export interface ServicesSchema {
  tableName: string;
  neighborhoodColumn: string | null;
  localityColumn: string | null;
  serviceFormatColumn: string | null;
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
  totalNumericCurrentDbServices: number;
  totalNonNumericCurrentDbRows: number;
  duplicateNumericServiceGroups: number;
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
