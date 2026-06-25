import { readFileSync } from "node:fs";
import { normalizeCsvHeader, parseCsvContent } from "../csv-parse";
import { buildCsv } from "../csv";
import { normalizeStoreNumber } from "./store-number";
import type { DatabaseStore, OfficialStore } from "./types";

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

export const loadOfficialStores = (filePath: string): OfficialStore[] =>
  readCsvRecords(filePath).flatMap((record) => {
    const rawStoreId = readField(record, "store_id");
    const storeNumber = normalizeStoreNumber(rawStoreId);
    if (!storeNumber) {
      return [];
    }

    return [
      {
        storeNumber,
        rawStoreId,
        officialAddress: readField(record, "official_address"),
        neighborhood: readField(record, "neighborhood"),
        locality: readField(record, "locality"),
      },
    ];
  });

export const loadDatabaseStores = (filePath: string): DatabaseStore[] =>
  readCsvRecords(filePath).map((record) => ({
    id: readField(record, "id"),
    name: readField(record, "name"),
    address: readField(record, "address"),
    latitude: parseCoordinate(readField(record, "latitude")),
    longitude: parseCoordinate(readField(record, "longitude")),
    neighborhood: readField(record, "neighborhood", "barrio"),
    locality: readField(record, "locality", "localidad"),
    storeFormat: readField(record, "store_format", "formato"),
    active: readField(record, "active"),
    raw: record,
  }));

export const SUMMARY_HEADERS = [
  "store_number",
  "status",
  "carrefour_official_address",
  "db_address",
  "address_match_status",
  "address_similarity",
  "db_latitude",
  "db_longitude",
  "geocoded_latitude",
  "geocoded_longitude",
  "coordinate_distance_meters",
  "coordinate_status",
  "db_id",
  "notes",
] as const;

export const DUPLICATE_HEADERS = [
  "source",
  "store_number",
  "duplicate_count",
  "details",
] as const;

const formatNumber = (value: number | null): string =>
  value === null ? "" : String(Math.round(value * 1000) / 1000);

const formatSimilarity = (value: number | null): string =>
  value === null ? "" : String(Math.round(value * 10000) / 10000);

export const reconciliationRowToCsv = (row: {
  storeNumber: string;
  status: string;
  carrefourOfficialAddress: string;
  dbAddress: string;
  addressMatchStatus: string;
  addressSimilarity: number | null;
  dbLatitude: number | null;
  dbLongitude: number | null;
  geocodedLatitude: number | null;
  geocodedLongitude: number | null;
  coordinateDistanceMeters: number | null;
  coordinateStatus: string;
  dbId: string;
  notes: string;
}): string[] => [
  row.storeNumber,
  row.status,
  row.carrefourOfficialAddress,
  row.dbAddress,
  row.addressMatchStatus,
  formatSimilarity(row.addressSimilarity),
  formatNumber(row.dbLatitude),
  formatNumber(row.dbLongitude),
  formatNumber(row.geocodedLatitude),
  formatNumber(row.geocodedLongitude),
  formatNumber(row.coordinateDistanceMeters),
  row.coordinateStatus,
  row.dbId,
  row.notes,
];

export const buildReconciliationCsv = (
  headers: readonly string[],
  rows: string[][],
): string => buildCsv([...headers], rows);
