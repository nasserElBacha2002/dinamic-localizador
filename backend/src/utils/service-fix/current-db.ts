import { calculateDistanceMeters } from "../haversine";
import { compareAddresses, normalizeAddress } from "../service-reconciliation/address";
import type { CurrentDbService, CurrentDbState, ReconciliationReportRow } from "./types";

const REPORT_COORDINATE_DRIFT_METERS = 25;

export const isNumericServiceName = (name: string): boolean => /^\d+$/.test(name.trim());

export const buildCurrentDbState = (services: CurrentDbService[]): CurrentDbState => {
  const byServiceNumber = new Map<string, CurrentDbService[]>();
  const nonNumericServices: CurrentDbService[] = [];

  for (const service of services) {
    if (isNumericServiceName(service.name)) {
      const key = service.name.trim();
      const bucket = byServiceNumber.get(key) ?? [];
      bucket.push(service);
      byServiceNumber.set(key, bucket);
    } else {
      nonNumericServices.push(service);
    }
  }

  const duplicateNumericGroups = new Map<string, CurrentDbService[]>();
  for (const [serviceNumber, rows] of byServiceNumber.entries()) {
    if (rows.length > 1) {
      duplicateNumericGroups.set(serviceNumber, rows);
    }
  }

  return {
    services,
    byServiceNumber,
    nonNumericServices,
    duplicateNumericGroups,
  };
};

export const getCurrentRowsForServiceNumber = (
  currentDb: CurrentDbState,
  serviceNumber: string,
): CurrentDbService[] => currentDb.byServiceNumber.get(serviceNumber.trim()) ?? [];

export const pickReportRowForService = (
  serviceNumber: string,
  reportRows: ReconciliationReportRow[],
  currentRow?: CurrentDbService,
): ReconciliationReportRow | undefined => {
  const candidates = reportRows.filter((row) => row.serviceNumber === serviceNumber);
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
  current: CurrentDbService,
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
  current: CurrentDbService,
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
