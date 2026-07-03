import * as XLSX from "xlsx";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { parseCsvContent, type ParsedCsv } from "./csv-parse";
import {
  createInventoryImportDateTimeUtils,
  formatInventoryDateParts,
  parseExcelSerialNumber,
} from "./inventory-import-datetime";

export type SpreadsheetFileType = "csv" | "xlsx";

export interface ParsedSpreadsheet {
  headers: string[];
  rows: string[][];
}

export const detectSpreadsheetFileType = (fileName: string): SpreadsheetFileType | null => {
  const lowerName = fileName.trim().toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return "csv";
  }

  if (lowerName.endsWith(".xlsx")) {
    return "xlsx";
  }

  return null;
};

const isFechaColumn = (header: string): boolean => header.toLowerCase() === "fecha";

const parseXlsxBuffer = (buffer: Buffer, operationTimezone: string): ParsedSpreadsheet => {
  const { dateToInventoryDateParts } = createInventoryImportDateTimeUtils({
    operationTimezone,
    defaultOperationStartTime: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationStartTime,
    defaultOperationEndTime: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationEndTime,
  });

  const cellToImportString = (value: unknown, header: string): string => {
    if (value === null || value === undefined) {
      return "";
    }

    if (value instanceof Date) {
      return formatInventoryDateParts(dateToInventoryDateParts(value));
    }

    if (typeof value === "number") {
      if (isFechaColumn(header)) {
        const serial = parseExcelSerialNumber(value);
        if (serial) {
          return formatInventoryDateParts(serial);
        }
      }

      if (Number.isFinite(value) && Math.trunc(value) === value) {
        return String(Math.trunc(value));
      }

      return String(value).trim();
    }

    return String(value).trim();
  };

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [] };
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }

  const headerRow = matrix[0] ?? [];
  const headers = headerRow.map((cell) => cellToImportString(cell, ""));

  const rows = matrix.slice(1).map((row) =>
    headers.map((header, index) => cellToImportString(row[index], header)),
  );

  return { headers, rows };
};

export const parseSpreadsheetBuffer = (
  buffer: Buffer,
  fileType: SpreadsheetFileType,
  operationTimezone: string = DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
): ParsedSpreadsheet => {
  if (fileType === "csv") {
    const parsed: ParsedCsv = parseCsvContent(buffer.toString("utf8"));
    return parsed;
  }

  return parseXlsxBuffer(buffer, operationTimezone);
};

export const isLikelyBinaryUpload = (buffer: Buffer): boolean => {
  if (buffer.length < 2) {
    return false;
  }

  return buffer[0] === 0x50 && buffer[1] === 0x4b;
};
