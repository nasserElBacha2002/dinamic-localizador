import type { ImportColumnDefinition, ImportPreviewRow, ImportPreviewSummary, ImportRowError } from "./types";
import { mapHeadersToColumns, rowToValues } from "./column-mapper";
import { parseImportFile } from "./parse-import-file";

export const rowError = (
  code: string,
  message: string,
  field: string | null = null,
  value: string | null = null,
  severity: "error" | "warning" = "error",
): ImportRowError => ({
  field,
  value,
  code,
  message,
  severity,
});

export const summarizePreviewRows = (
  rows: ImportPreviewRow[],
  requireAllRowsValid: boolean,
): ImportPreviewSummary => {
  const validRows = rows.filter((row) => row.status === "valid").length;
  const warningRows = rows.filter((row) => row.status === "warning").length;
  const invalidRows = rows.filter((row) => row.status === "invalid").length;
  const canConfirm = requireAllRowsValid
    ? invalidRows === 0 && validRows > 0
    : validRows > 0;

  return {
    totalRows: rows.length,
    validRows,
    invalidRows,
    warningRows,
    canConfirm,
    createdEstimate: validRows,
    updatedEstimate: 0,
  };
};

export const parseAndMapColumns = (
  buffer: Buffer,
  fileName: string,
  columns: ImportColumnDefinition[],
  options?: { maxRows?: number; operationTimezone?: string },
): {
  fileType: "csv" | "xlsx";
  fileErrors: string[];
  mapping: Record<string, number>;
  dataRows: Array<{ rowNumber: number; values: Record<string, string> }>;
} => {
  const parsed = parseImportFile(buffer, fileName, options);
  const headerMapping = mapHeadersToColumns(parsed.headers, columns);
  const fileErrors: string[] = [];

  if (headerMapping.missingRequired.length > 0) {
    fileErrors.push(
      `Faltan columnas obligatorias: ${headerMapping.missingRequired.join(", ")}.`,
    );
  }
  if (headerMapping.duplicateHeaders.length > 0) {
    fileErrors.push(
      `Encabezados duplicados: ${headerMapping.duplicateHeaders.join(", ")}.`,
    );
  }
  if (headerMapping.unknownHeaders.length > 0) {
    fileErrors.push(`Columnas desconocidas: ${headerMapping.unknownHeaders.join(", ")}.`);
  }

  const structureInvalid =
    headerMapping.missingRequired.length > 0 ||
    headerMapping.duplicateHeaders.length > 0 ||
    headerMapping.unknownHeaders.length > 0;

  const dataRows = structureInvalid
    ? []
    : parsed.rows.map((cells, index) => ({
        rowNumber: index + 2,
        values: rowToValues(cells, headerMapping.mapped, columns),
      }));

  return {
    fileType: parsed.fileType,
    fileErrors,
    mapping: headerMapping.mapped,
    dataRows,
  };
};

export const markInFileDuplicates = (
  rows: Array<{ rowNumber: number; values: Record<string, string>; uniqueKey: string | null }>,
  field: string,
  code: string,
  message: string,
): Map<number, ImportRowError[]> => {
  const firstSeen = new Map<string, number>();
  const errorsByRow = new Map<number, ImportRowError[]>();

  for (const row of rows) {
    if (!row.uniqueKey) {
      continue;
    }
    const existing = firstSeen.get(row.uniqueKey);
    if (existing !== undefined) {
      const list = errorsByRow.get(row.rowNumber) ?? [];
      list.push(
        rowError(code, `${message} (duplicado de la fila ${existing}).`, field, row.uniqueKey),
      );
      errorsByRow.set(row.rowNumber, list);
    } else {
      firstSeen.set(row.uniqueKey, row.rowNumber);
    }
  }

  return errorsByRow;
};
