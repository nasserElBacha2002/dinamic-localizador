import { AppError } from "../errors/app-error";
import {
  detectSpreadsheetFileType,
  isLikelyBinaryUpload,
  parseSpreadsheetBuffer,
  type SpreadsheetFileType,
} from "../utils/spreadsheet-parse";
import {
  DEFAULT_IMPORT_MAX_BASE64_CHARS,
  DEFAULT_IMPORT_MAX_FILE_BYTES,
  DEFAULT_IMPORT_MAX_ROWS,
} from "./constants";

export interface ParsedImportFile {
  fileType: SpreadsheetFileType;
  headers: string[];
  rows: string[][];
}

const normalizeBase64 = (value: string): string => value.replace(/\s+/g, "");

/**
 * Strict Base64 decode: syntax/padding validation, size bound, and round-trip check.
 * Does not rely on Buffer.from throwing for invalid input.
 */
export const decodeImportBase64 = (fileContentBase64: string): Buffer => {
  const normalized = normalizeBase64(fileContentBase64);
  if (!normalized) {
    throw new AppError(400, "IMPORT_INVALID_FILE", "No se pudo leer el contenido del archivo.");
  }

  if (normalized.length > DEFAULT_IMPORT_MAX_BASE64_CHARS) {
    throw new AppError(
      400,
      "IMPORT_FILE_TOO_LARGE",
      `El archivo supera el tamaño máximo permitido (${Math.floor(DEFAULT_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB).`,
    );
  }

  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new AppError(400, "IMPORT_INVALID_FILE", "El contenido Base64 del archivo es inválido.");
  }

  const paddingMatch = normalized.match(/=+$/);
  if (paddingMatch && paddingMatch[0].length > 2) {
    throw new AppError(400, "IMPORT_INVALID_FILE", "El contenido Base64 del archivo es inválido.");
  }

  const buffer = Buffer.from(normalized, "base64");
  const reencoded = buffer.toString("base64");
  if (reencoded !== normalized) {
    throw new AppError(400, "IMPORT_INVALID_FILE", "El contenido Base64 del archivo es inválido.");
  }

  if (buffer.length > DEFAULT_IMPORT_MAX_FILE_BYTES) {
    throw new AppError(
      400,
      "IMPORT_FILE_TOO_LARGE",
      `El archivo supera el tamaño máximo permitido (${Math.floor(DEFAULT_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB).`,
    );
  }

  return buffer;
};

export const parseImportFile = (
  buffer: Buffer,
  fileName: string,
  options?: {
    maxFileBytes?: number;
    maxRows?: number;
    operationTimezone?: string;
  },
): ParsedImportFile => {
  const maxFileBytes = options?.maxFileBytes ?? DEFAULT_IMPORT_MAX_FILE_BYTES;
  const maxRows = options?.maxRows ?? DEFAULT_IMPORT_MAX_ROWS;

  if (buffer.length === 0) {
    throw new AppError(400, "IMPORT_EMPTY_FILE", "El archivo está vacío.");
  }

  if (buffer.length > maxFileBytes) {
    throw new AppError(
      400,
      "IMPORT_FILE_TOO_LARGE",
      `El archivo supera el tamaño máximo permitido (${Math.floor(maxFileBytes / (1024 * 1024))} MB).`,
    );
  }

  const fileType = detectSpreadsheetFileType(fileName);
  if (!fileType) {
    throw new AppError(
      400,
      "IMPORT_UNSUPPORTED_FILE_TYPE",
      "Formato no soportado. Usá un archivo CSV o XLSX.",
    );
  }

  if (fileType === "csv" && isLikelyBinaryUpload(buffer)) {
    throw new AppError(
      400,
      "IMPORT_UNSUPPORTED_FILE_TYPE",
      "El contenido no parece un CSV válido. Si es Excel, subilo como .xlsx.",
    );
  }

  const parsed = parseSpreadsheetBuffer(buffer, fileType, options?.operationTimezone);
  if (parsed.headers.length === 0) {
    throw new AppError(400, "IMPORT_EMPTY_FILE", "El archivo no contiene encabezados.");
  }

  if (parsed.rows.length === 0) {
    throw new AppError(400, "IMPORT_EMPTY_FILE", "El archivo no contiene filas de datos.");
  }

  if (parsed.rows.length > maxRows) {
    throw new AppError(
      400,
      "IMPORT_TOO_MANY_ROWS",
      `El archivo supera el máximo de ${maxRows} filas.`,
    );
  }

  return {
    fileType,
    headers: parsed.headers,
    rows: parsed.rows,
  };
};

export const buildCsvTemplate = (headers: string[], sampleRows: string[][] = []): Buffer => {
  const escape = (value: string): string => {
    if (/[",\n;]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const lines = [
    headers.map(escape).join(","),
    ...sampleRows.map((row) => row.map((cell) => escape(cell ?? "")).join(",")),
  ];
  return Buffer.from(`${lines.join("\n")}\n`, "utf8");
};
