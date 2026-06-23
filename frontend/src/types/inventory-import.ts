export type InventoryImportRowStatus = "valid" | "invalid";
export type InventoryImportFormat = "client" | "legacy";
export type InventoryImportFileType = "csv" | "xlsx";

export interface InventoryImportPreviewRow {
  rowNumber: number;
  format: InventoryImportFormat;
  punto: string;
  tienda: string;
  storeId: string | null;
  storeName: string | null;
  rawFecha: string;
  parsedInventoryDate: string | null;
  fechaInicio: string;
  fechaFin: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledStartDisplay: string;
  scheduledEndDisplay: string;
  toleranciaTemprana: string;
  toleranciaTardia: string;
  earlyToleranceMinutes: number | null;
  lateToleranceMinutes: number | null;
  earlyToleranceDisplay: string;
  lateToleranceDisplay: string;
  notas: string;
  status: InventoryImportRowStatus;
  errors: string[];
}

export interface InventoryImportPreviewSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  canConfirm: boolean;
}

export interface InventoryImportPreviewResult {
  format: InventoryImportFormat | null;
  fileType: InventoryImportFileType | null;
  summary: InventoryImportPreviewSummary;
  rows: InventoryImportPreviewRow[];
  fileErrors: string[];
}

export interface InventoryImportConfirmRow {
  storeId: string;
  scheduledStart: string;
  scheduledEnd: string;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  notes: string | null;
}

export interface InventoryImportPreviewPayload {
  fileName: string;
  fileContentBase64: string;
}
