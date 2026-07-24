import { exportToCsv } from "../utils/export";
import type { ImportExecuteResult, ImportPreviewResult } from "../types/import";

export const UNSUPPORTED_IMPORT_FILE_MESSAGE =
  "Formato de archivo no soportado. Subí un archivo CSV o XLSX.";

/** Protect spreadsheet formula injection for exported CSV cells. */
export function escapeCsvFormulaInjection(value: string): string {
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export async function readFileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    chunks.push(String.fromCharCode(...slice));
  }
  return btoa(chunks.join(""));
}

export function isAcceptedImportFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith(".csv") || lowerName.endsWith(".xlsx");
}

const sanitizeFileName = (fileName: string): string =>
  fileName.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-");

export function downloadImportRejectedRows(
  sourceFileName: string,
  result: ImportPreviewResult | ImportExecuteResult,
  displayColumns?: Array<{ key: string; header: string }>,
): void {
  const errorRows =
    "summary" in result && "created" in result.summary
      ? (result as ImportExecuteResult).rows.filter((row) => row.status === "rejected")
      : (result as ImportPreviewResult).rows.filter((row) => row.errors.length > 0);

  if (errorRows.length === 0) {
    return;
  }

  const columns =
    displayColumns && displayColumns.length > 0
      ? displayColumns
      : "displayColumns" in result && result.displayColumns.length > 0
        ? result.displayColumns
        : Object.keys(errorRows[0]?.values ?? {}).map((key) => ({ key, header: key }));

  const headers = ["Fila", ...columns.map((column) => column.header), "Errores"];
  const rows = errorRows.map((row) => [
    row.rowNumber,
    ...columns.map((column) =>
      escapeCsvFormulaInjection(String(row.values[column.key] ?? "")),
    ),
    escapeCsvFormulaInjection(row.errors.map((error) => error.message).join(" | ")),
  ]);

  exportToCsv(`errores-importacion-${sanitizeFileName(sourceFileName)}`, headers, rows);
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function resolveImportNotification(result: ImportExecuteResult): {
  color: "green" | "yellow" | "red";
  title: string;
} {
  const { created, rejected } = result.summary;
  if (rejected === 0 && created > 0) {
    return { color: "green", title: "Importación completada" };
  }
  if (created > 0 && rejected > 0) {
    return { color: "yellow", title: "Importación parcial" };
  }
  return { color: "red", title: "Importación rechazada" };
}
