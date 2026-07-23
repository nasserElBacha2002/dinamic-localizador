import { exportToCsv } from "../utils/export";
import type { ImportExecuteResult, ImportPreviewResult } from "../types/import";

export const UNSUPPORTED_IMPORT_FILE_MESSAGE =
  "Formato de archivo no soportado. Subí un archivo CSV o XLSX.";

export async function readFileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
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
): void {
  const errorRows =
    "summary" in result && "created" in result.summary
      ? (result as ImportExecuteResult).rows.filter((row) => row.status === "rejected")
      : (result as ImportPreviewResult).rows.filter((row) => row.errors.length > 0);

  if (errorRows.length === 0) {
    return;
  }

  const valueKeys = Object.keys(errorRows[0]?.values ?? {});
  const headers = ["Fila", ...valueKeys, "Errores"];
  const rows = errorRows.map((row) => [
    row.rowNumber,
    ...valueKeys.map((key) => row.values[key] ?? ""),
    row.errors.map((error) => error.message).join(" | "),
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
