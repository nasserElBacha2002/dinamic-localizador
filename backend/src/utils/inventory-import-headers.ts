import {
  CLIENT_IMPORT_IGNORED_HEADERS,
  IMPORT_MISSING_DATE_MESSAGE,
  IMPORT_MISSING_LEGACY_END_DATE_MESSAGE,
  IMPORT_MISSING_LOCATION_MESSAGE,
  INVENTORY_IMPORT_COLUMN_ALIASES,
} from "../constants/inventory-import";
import type { InventoryImportFormat } from "../types/inventory-import";
import { normalizeCsvHeader } from "./csv-parse";

export const normalizeImportColumnName = normalizeCsvHeader;

const LOCATION_ALIASES = new Set(
  INVENTORY_IMPORT_COLUMN_ALIASES.location.map((header) => normalizeImportColumnName(header)),
);

const CLIENT_DATE_ALIASES = new Set(
  INVENTORY_IMPORT_COLUMN_ALIASES.startDate.map((header) => normalizeImportColumnName(header)),
);

const EXTENDED_START_DATE_ALIASES = new Set(
  INVENTORY_IMPORT_COLUMN_ALIASES.startDateExtended.map((header) =>
    normalizeImportColumnName(header),
  ),
);

const EXTENDED_END_DATE_ALIASES = new Set(
  INVENTORY_IMPORT_COLUMN_ALIASES.endDate.map((header) => normalizeImportColumnName(header)),
);

const LOCATION_TYPE_ALIASES = new Set(
  INVENTORY_IMPORT_COLUMN_ALIASES.locationType.map((header) => normalizeImportColumnName(header)),
);

const OPTIONAL_HEADER_ALIASES = new Set([
  "tolerancia_temprana",
  "tolerancia_tardia",
  "notas",
  ...CLIENT_IMPORT_IGNORED_HEADERS,
]);

export const resolveImportHeaderColumn = (header: string): string => {
  const normalized = normalizeImportColumnName(header);

  if (EXTENDED_END_DATE_ALIASES.has(normalized)) {
    return "fecha_fin";
  }

  if (EXTENDED_START_DATE_ALIASES.has(normalized)) {
    return "fecha_inicio";
  }

  if (CLIENT_DATE_ALIASES.has(normalized)) {
    return "fecha";
  }

  if (LOCATION_ALIASES.has(normalized)) {
    return "location";
  }

  if (LOCATION_TYPE_ALIASES.has(normalized)) {
    return "location_type";
  }

  if (OPTIONAL_HEADER_ALIASES.has(normalized)) {
    return normalized;
  }

  return normalized;
};

export interface MappedImportHeaders {
  mapped: string[];
  format: InventoryImportFormat | null;
  fileErrors: string[];
}

export const mapImportHeaders = (headers: string[]): MappedImportHeaders => {
  const mapped = headers.map((header) => resolveImportHeaderColumn(header));
  const mappedSet = new Set(mapped);

  const hasLocation = mappedSet.has("location");
  const hasClientDate = mappedSet.has("fecha");
  const hasLegacyStart = mappedSet.has("fecha_inicio");
  const hasLegacyEnd = mappedSet.has("fecha_fin");

  if (hasLegacyStart && hasLegacyEnd) {
    if (!hasLocation) {
      return { mapped, format: null, fileErrors: [IMPORT_MISSING_LOCATION_MESSAGE] };
    }

    return { mapped, format: "legacy", fileErrors: [] };
  }

  if (hasClientDate) {
    const fileErrors: string[] = [];
    if (!hasLocation) {
      fileErrors.push(IMPORT_MISSING_LOCATION_MESSAGE);
    }

    return {
      mapped,
      format: fileErrors.length === 0 ? "client" : null,
      fileErrors,
    };
  }

  const fileErrors: string[] = [];
  if (!hasLocation) {
    fileErrors.push(IMPORT_MISSING_LOCATION_MESSAGE);
  }
  if (!hasClientDate && !hasLegacyStart) {
    fileErrors.push(IMPORT_MISSING_DATE_MESSAGE);
  }
  if (hasLegacyStart && !hasLegacyEnd) {
    fileErrors.push(IMPORT_MISSING_LEGACY_END_DATE_MESSAGE);
  }

  return { mapped, format: null, fileErrors };
};
