import { calculateDistanceMeters } from "../haversine";
import { compareAddresses, normalizeAddress } from "../store-reconciliation/address";
import type { CurrentDbState, CurrentDbStore, ReconciliationReportRow } from "./types";

const REPORT_COORDINATE_DRIFT_METERS = 25;

export const isNumericStoreName = (name: string): boolean => /^\d+$/.test(name.trim());

export const buildCurrentDbState = (stores: CurrentDbStore[]): CurrentDbState => {
  const byStoreNumber = new Map<string, CurrentDbStore[]>();
  const nonNumericStores: CurrentDbStore[] = [];

  for (const store of stores) {
    if (isNumericStoreName(store.name)) {
      const key = store.name.trim();
      const bucket = byStoreNumber.get(key) ?? [];
      bucket.push(store);
      byStoreNumber.set(key, bucket);
    } else {
      nonNumericStores.push(store);
    }
  }

  const duplicateNumericGroups = new Map<string, CurrentDbStore[]>();
  for (const [storeNumber, rows] of byStoreNumber.entries()) {
    if (rows.length > 1) {
      duplicateNumericGroups.set(storeNumber, rows);
    }
  }

  return {
    stores,
    byStoreNumber,
    nonNumericStores,
    duplicateNumericGroups,
  };
};

export const getCurrentRowsForStoreNumber = (
  currentDb: CurrentDbState,
  storeNumber: string,
): CurrentDbStore[] => currentDb.byStoreNumber.get(storeNumber.trim()) ?? [];

export const pickReportRowForStore = (
  storeNumber: string,
  reportRows: ReconciliationReportRow[],
  currentRow?: CurrentDbStore,
): ReconciliationReportRow | undefined => {
  const candidates = reportRows.filter((row) => row.storeNumber === storeNumber);
  if (candidates.length === 0) {
    return undefined;
  }

  if (currentRow) {
    const idMatch = candidates.find(
      (row) => row.dbId && row.dbId.toUpperCase() === currentRow.id.toUpperCase(),
    );
    if (idMatch) {
      return idMatch;
    }
  }

  return candidates.find((row) => row.geocodingStatus === "OK") ?? candidates[0];
};

export interface ReportDriftResult {
  currentAddress: string;
  currentLatitude: number | null;
  currentLongitude: number | null;
  reportDbIdMismatch: boolean;
  notes: string[];
}

export const detectReportDrift = (
  current: CurrentDbStore,
  report: ReconciliationReportRow,
): ReportDriftResult => {
  const notes: string[] = [];
  let currentAddress = current.address;
  let currentLatitude = current.latitude;
  let currentLongitude = current.longitude;

  const reportDbIdMismatch = Boolean(
    report.dbId && report.dbId.toUpperCase() !== current.id.toUpperCase(),
  );

  if (reportDbIdMismatch) {
    notes.push("current_db_differs_from_report");
  }

  if (normalizeAddress(current.address) !== normalizeAddress(report.dbAddress)) {
    notes.push("current_db_differs_from_report");
    currentAddress = current.address;
  }

  const reportLatitude = Number.parseFloat(report.dbLatitude);
  const reportLongitude = Number.parseFloat(report.dbLongitude);

  if (
    current.latitude !== null &&
    current.longitude !== null &&
    Number.isFinite(reportLatitude) &&
    Number.isFinite(reportLongitude)
  ) {
    const drift = calculateDistanceMeters(
      current.latitude,
      current.longitude,
      reportLatitude,
      reportLongitude,
    );

    if (drift > REPORT_COORDINATE_DRIFT_METERS) {
      notes.push("current_db_differs_from_report");
      currentLatitude = current.latitude;
      currentLongitude = current.longitude;
    }
  }

  return {
    currentAddress,
    currentLatitude,
    currentLongitude,
    reportDbIdMismatch,
    notes: [...new Set(notes)],
  };
};

export const recomputeCoordinateStatus = (
  distanceMeters: number,
): "ok" | "review" | "mismatch" => {
  if (distanceMeters <= 100) {
    return "ok";
  }

  if (distanceMeters <= 300) {
    return "review";
  }

  return "mismatch";
};

export const recomputeCoordinateDistance = (
  current: CurrentDbStore,
  geocodedLatitude: string,
  geocodedLongitude: string,
): number | null => {
  const targetLatitude = Number.parseFloat(geocodedLatitude);
  const targetLongitude = Number.parseFloat(geocodedLongitude);

  if (
    current.latitude === null ||
    current.longitude === null ||
    !Number.isFinite(targetLatitude) ||
    !Number.isFinite(targetLongitude)
  ) {
    return null;
  }

  return calculateDistanceMeters(
    current.latitude,
    current.longitude,
    targetLatitude,
    targetLongitude,
  );
};

export const compareCurrentAddressToOfficial = (
  currentAddress: string,
  officialAddress: string,
) => compareAddresses(officialAddress, currentAddress);
