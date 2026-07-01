import { exportToCsv } from "./export";
import type { InventoryImportPreviewResult } from "../types/inventory-import";

export const RECOMMENDED_IMPORT_TEMPLATE_HEADERS = ["Sucursal", "Fecha"] as const;

export const INVENTORY_IMPORT_FORMAT_HELP = [
  "Formatos admitidos: CSV y XLSX.",
  "Formato mínimo recomendado: Sucursal, Fecha.",
  "También se acepta el formato legacy: PUNTO, Fecha.",
  "El sistema usa Sucursal/PUNTO para buscar una ubicación existente.",
  "Las columnas LOCAL, Formato y PROVEEDOR pueden venir en el archivo, pero se ignoran.",
  "Si solo se informa una fecha, la operación empieza a las 20:30 y finaliza al día siguiente a las 03:00.",
  "Las tolerancias usan 60 y 90 minutos por defecto si no se informan.",
  "También se acepta el formato extendido: tienda, fecha_inicio, fecha_fin (o ubicacion/sucursal).",
].join(" ");

export function downloadRecommendedImportTemplate(): void {
  exportToCsv("plantilla-importacion-operaciones", [...RECOMMENDED_IMPORT_TEMPLATE_HEADERS], [["", ""]]);
}

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

export function downloadInventoryImportErrors(
  sourceFileName: string,
  preview: InventoryImportPreviewResult,
): void {
  const errorRows = preview.rows.filter((row) => row.errors.length > 0);
  if (errorRows.length === 0) {
    return;
  }

  const isClientFormat = preview.format === "client";
  const headers = isClientFormat
    ? ["Fila", "PUNTO", "Tienda resuelta", "Fecha original", "Errores"]
    : ["Fila", "Tienda", "Tienda resuelta", "Inicio original", "Fin original", "Errores"];

  const rows = errorRows.map((row) =>
    isClientFormat
      ? [
          row.rowNumber,
          row.punto || row.tienda,
          row.storeName ?? "",
          row.rawFecha,
          row.errors.join(" | "),
        ]
      : [
          row.rowNumber,
          row.tienda,
          row.storeName ?? "",
          row.fechaInicio,
          row.fechaFin,
          row.errors.join(" | "),
        ],
  );

  exportToCsv(`errores-importacion-${sanitizeFileName(sourceFileName)}`, headers, rows);
}
