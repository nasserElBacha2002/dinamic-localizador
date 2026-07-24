import { normalizeCsvHeader } from "../utils/csv-parse";
import type { ImportColumnDefinition } from "./types";

export const normalizeImportHeader = (header: string): string => normalizeCsvHeader(header);

export const buildAliasLookup = (
  columns: ImportColumnDefinition[],
): Map<string, string> => {
  const lookup = new Map<string, string>();
  for (const column of columns) {
    lookup.set(normalizeImportHeader(column.header), column.key);
    lookup.set(normalizeImportHeader(column.key), column.key);
    for (const alias of column.aliases ?? []) {
      lookup.set(normalizeImportHeader(alias), column.key);
    }
  }
  return lookup;
};

export interface HeaderMappingResult {
  mapped: Record<string, number>;
  unknownHeaders: string[];
  duplicateHeaders: string[];
  missingRequired: string[];
}

export const mapHeadersToColumns = (
  rawHeaders: string[],
  columns: ImportColumnDefinition[],
): HeaderMappingResult => {
  const aliasLookup = buildAliasLookup(columns);
  const mapped: Record<string, number> = {};
  const unknownHeaders: string[] = [];
  const duplicateHeaders: string[] = [];
  const seenNormalized = new Map<string, string>();

  rawHeaders.forEach((header, index) => {
    const normalized = normalizeImportHeader(header);
    if (!normalized) {
      return;
    }

    if (seenNormalized.has(normalized)) {
      duplicateHeaders.push(header);
      return;
    }
    seenNormalized.set(normalized, header);

    const key = aliasLookup.get(normalized);
    if (!key) {
      unknownHeaders.push(header);
      return;
    }

    if (mapped[key] !== undefined) {
      duplicateHeaders.push(header);
      return;
    }

    mapped[key] = index;
  });

  const missingRequired = columns
    .filter((column) => column.required && mapped[column.key] === undefined)
    .map((column) => column.header);

  return { mapped, unknownHeaders, duplicateHeaders, missingRequired };
};

export const rowToValues = (
  cells: string[],
  mapping: Record<string, number>,
  columns: ImportColumnDefinition[],
): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const column of columns) {
    const index = mapping[column.key];
    values[column.key] = index === undefined ? "" : String(cells[index] ?? "").trim();
  }
  return values;
};
