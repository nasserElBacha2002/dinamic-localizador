import { normalizeCsvHeader } from "../csv-parse";

export type CanonicalOperationImportRowType = "PUNTUAL" | "FIJA" | "MULTI_TURNO";

export const OPERATION_CANONICAL_IMPORT_ROW_TYPE_VALUES = [
  "PUNTUAL",
  "FIJA",
  "MULTI_TURNO",
] as const;

export const IMPORT_INVALID_CANONICAL_ROW_TYPE_MESSAGE =
  'La columna Tipo debe ser PUNTUAL, FIJA o MULTI_TURNO.';

export const IMPORT_MISSING_CANONICAL_ROW_TYPE_MESSAGE =
  "La columna Tipo es obligatoria en la plantilla unificada de operaciones.";

const PUNTUAL_ALIASES = new Set([
  "puntual",
  "one_time",
  "one-time",
  "one time",
  "eventual",
  "unica",
  "única",
]);

const FIJA_ALIASES = new Set([
  "fija",
  "fijo",
  "recurring",
  "recurrente",
  "habitual",
  "single",
]);

const MULTI_TURNO_ALIASES = new Set([
  "multi_turno",
  "multi-turno",
  "multi turno",
  "multiturno",
  "multi_shift",
  "multi-shift",
  "multi shift",
]);

export const isCanonicalOperationImportHeaders = (headers: string[]): boolean => {
  const normalized = new Set(headers.map((header) => normalizeCsvHeader(header)));
  return normalized.has("tipo") && normalized.has("fecha") && normalized.has("vigencia_desde");
};

export const parseCanonicalOperationImportRowType = (
  raw: string,
): { type: CanonicalOperationImportRowType | null; error: string | null } => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { type: null, error: IMPORT_MISSING_CANONICAL_ROW_TYPE_MESSAGE };
  }

  const normalized = trimmed.toLowerCase().replace(/\s+/g, "_");

  if (normalized === "puntual" || PUNTUAL_ALIASES.has(normalized)) {
    return { type: "PUNTUAL", error: null };
  }

  if (normalized === "fija" || FIJA_ALIASES.has(normalized)) {
    return { type: "FIJA", error: null };
  }

  if (normalized === "multi_turno" || MULTI_TURNO_ALIASES.has(normalized)) {
    return { type: "MULTI_TURNO", error: null };
  }

  return { type: null, error: IMPORT_INVALID_CANONICAL_ROW_TYPE_MESSAGE };
};
