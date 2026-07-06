import { existsSync, readFileSync } from "node:fs";
import { normalizeCsvHeader, parseCsvContent } from "../csv-parse";
import type { DuplicateReportRow, ReconciliationReportRow } from "./types";

const readCsvRecords = (filePath: string): Record<string, string>[] => {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, "utf8");
  const parsed = parseCsvContent(content);

  return parsed.rows.map((row) => {
    const record: Record<string, string> = {};
    parsed.headers.forEach((header, index) => {
      record[normalizeCsvHeader(header)] = row[index] ?? "";
    });
    return record;
  });
};

const field = (record: Record<string, string>, key: string, ...fallbackKeys: string[]): string => {
  for (const candidate of [key, ...fallbackKeys]) {
    const value = record[candidate]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
};

export const loadReconciliationRows = (filePath: string): ReconciliationReportRow[] =>
  readCsvRecords(filePath).map((record) => ({
    serviceNumber: field(record, "store_number"),
    status: field(record, "status"),
    carrefourOfficialAddress: field(record, "carrefour_official_address"),
    dbAddress: field(record, "db_address"),
    addressMatchStatus: field(record, "address_match_status"),
    addressSimilarity: field(record, "address_similarity"),
    normalizedOfficialAddress: field(record, "normalized_official_address"),
    normalizedDbAddress: field(record, "normalized_db_address"),
    addressDifferenceReason: field(record, "address_difference_reason"),
    dbLatitude: field(record, "db_latitude"),
    dbLongitude: field(record, "db_longitude"),
    geocodedLatitude: field(record, "geocoded_latitude"),
    geocodedLongitude: field(record, "geocoded_longitude"),
    coordinateDistanceMeters: field(record, "coordinate_distance_meters"),
    coordinateStatus: field(record, "coordinate_status"),
    geocodingStatus: field(record, "geocoding_status"),
    geocodingErrorCode: field(record, "geocoding_error_code"),
    geocodingErrorMessage: field(record, "geocoding_error_message"),
    geocodingQuery: field(record, "geocoding_query"),
    dbId: field(record, "db_id"),
    notes: field(record, "notes"),
  }));

export const loadDuplicateRows = (filePath: string): DuplicateReportRow[] =>
  readCsvRecords(filePath).map((record) => ({
    source: field(record, "source"),
    serviceNumber: field(record, "store_number"),
    duplicateCount: field(record, "duplicate_count"),
    dbId: field(record, "db_id"),
    dbAddress: field(record, "db_address"),
    googlePlaceId: field(record, "google_place_id"),
    latitude: field(record, "latitude"),
    longitude: field(record, "longitude"),
    createdAt: field(record, "created_at"),
    updatedAt: field(record, "updated_at"),
    active: field(record, "active"),
    addressMatchesOfficial: field(record, "address_matches_official"),
    coordinateStatus: field(record, "coordinate_status"),
    officialAddress: field(record, "official_address"),
    details: field(record, "details"),
  }));

export interface DatabaseExportRow {
  id: string;
  name: string;
  address: string;
}

export const loadDatabaseExportRows = (filePath?: string): DatabaseExportRow[] => {
  if (!filePath || !existsSync(filePath)) {
    return [];
  }

  return readCsvRecords(filePath).map((record) => ({
    id: field(record, "id"),
    name: field(record, "name"),
    address: field(record, "address"),
  }));
};

export interface OfficialSourceRow {
  serviceNumber: string;
  officialAddress: string;
  neighborhood: string;
  locality: string;
}

export const loadOfficialSourceRows = (filePath?: string): OfficialSourceRow[] => {
  if (!filePath || !existsSync(filePath)) {
    return [];
  }

  return readCsvRecords(filePath).flatMap((record) => {
    const rawStoreId = field(record, "store_id");
    const serviceNumber = rawStoreId.replace(/\.0+$/, "").trim();
    if (!/^\d+$/.test(serviceNumber)) {
      return [];
    }

    return [
      {
        serviceNumber,
        officialAddress: field(record, "official_address"),
        neighborhood: field(record, "neighborhood", "barrio"),
        locality: field(record, "locality", "localidad"),
      },
    ];
  });
};

const escapeReportCsvValue = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

export const buildReportCsv = (headers: readonly string[], rows: string[][]): string => {
  const lines = [
    headers.map(escapeReportCsvValue).join(","),
    ...rows.map((row) => row.map(escapeReportCsvValue).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}`;
};
