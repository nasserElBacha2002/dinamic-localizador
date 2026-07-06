import { readFileSync } from "node:fs";
import { normalizeCsvHeader, parseCsvContent } from "../csv-parse";
import { normalizeServiceNumber } from "./service-number";
import type { DatabaseService, OfficialService, ReconciliationRow } from "./types";

const readCsvRecords = (filePath: string): Record<string, string>[] => {
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

const readField = (record: Record<string, string>, ...keys: string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined) {
      return value.trim();
    }
  }

  return "";
};

const parseCoordinate = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export const loadOfficialServices = (filePath: string): OfficialService[] =>
  readCsvRecords(filePath).flatMap((record) => {
    const rawServiceId = readField(record, "store_id");
    const serviceNumber = normalizeServiceNumber(rawServiceId);
    if (!serviceNumber) {
      return [];
    }

    return [
      {
        serviceNumber,
        rawServiceId,
        officialAddress: readField(record, "official_address"),
        neighborhood: readField(record, "neighborhood"),
        locality: readField(record, "locality"),
      },
    ];
  });

export const loadDatabaseServices = (filePath: string): DatabaseService[] =>
  readCsvRecords(filePath).map((record) => {
    const latitudeRaw = readField(record, "latitude");
    const longitudeRaw = readField(record, "longitude");

    return {
      id: readField(record, "id"),
      name: readField(record, "name"),
      address: readField(record, "address"),
      latitude: parseCoordinate(latitudeRaw),
      longitude: parseCoordinate(longitudeRaw),
      latitudeRaw,
      longitudeRaw,
      neighborhood: readField(record, "neighborhood", "barrio"),
      locality: readField(record, "locality", "localidad"),
      serviceFormat: readField(record, "store_format", "formato"),
      active: readField(record, "active"),
      googlePlaceId: readField(record, "google_place_id"),
      createdAt: readField(record, "created_at"),
      updatedAt: readField(record, "updated_at"),
      raw: record,
    };
  });

export const SUMMARY_HEADERS = [
  "store_number",
  "status",
  "carrefour_official_address",
  "db_address",
  "address_match_status",
  "address_similarity",
  "normalized_official_address",
  "normalized_db_address",
  "address_difference_reason",
  "db_latitude",
  "db_longitude",
  "geocoded_latitude",
  "geocoded_longitude",
  "coordinate_distance_meters",
  "coordinate_status",
  "geocoding_status",
  "geocoding_error_code",
  "geocoding_error_message",
  "geocoding_query",
  "db_id",
  "notes",
] as const;

export const DUPLICATE_HEADERS = [
  "source",
  "store_number",
  "duplicate_count",
  "db_id",
  "db_address",
  "google_place_id",
  "latitude",
  "longitude",
  "created_at",
  "updated_at",
  "active",
  "address_matches_official",
  "coordinate_status",
  "official_address",
  "details",
] as const;

const escapeReportCsvValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

const formatSimilarity = (value: number | null): string =>
  value === null ? "" : String(Math.round(value * 10000) / 10000);

const formatDistanceMeters = (value: number | null): string =>
  value === null ? "" : String(Math.round(value * 100) / 100);

export const reconciliationRowToCsv = (row: ReconciliationRow): string[] => [
  row.serviceNumber,
  row.status,
  row.carrefourOfficialAddress,
  row.dbAddress,
  row.addressMatchStatus,
  formatSimilarity(row.addressSimilarity),
  row.normalizedOfficialAddress,
  row.normalizedDbAddress,
  row.addressDifferenceReason,
  row.dbLatitude,
  row.dbLongitude,
  row.geocodedLatitude,
  row.geocodedLongitude,
  formatDistanceMeters(row.coordinateDistanceMeters),
  row.coordinateStatus,
  row.geocodingStatus,
  row.geocodingErrorCode,
  row.geocodingErrorMessage,
  row.geocodingQuery,
  row.dbId,
  row.notes,
];

export const buildReconciliationCsv = (
  headers: readonly string[],
  rows: string[][],
): string => {
  const lines = [
    headers.map(escapeReportCsvValue).join(","),
    ...rows.map((row) => row.map(escapeReportCsvValue).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}`;
};
