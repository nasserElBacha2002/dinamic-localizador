export type OperationImportRowStatus = "valid" | "invalid";
export type OperationImportFormat = "client" | "legacy";

export interface OperationImportPreviewRow {
  rowNumber: number;
  format: OperationImportFormat;
  punto: string;
  legacyLocation: string;
  serviceId: string | null;
  serviceName: string | null;
  rawFecha: string;
  parsedOperationDate: string | null;
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
  status: OperationImportRowStatus;
  errors: string[];
}

export interface OperationImportPreviewSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  canConfirm: boolean;
}

export interface OperationImportPreviewResult {
  format: OperationImportFormat | null;
  fileType: "csv" | "xlsx" | null;
  summary: OperationImportPreviewSummary;
  rows: OperationImportPreviewRow[];
  fileErrors: string[];
}

export interface OperationImportConfirmRow {
  serviceId: string;
  scheduledStart: string;
  scheduledEnd: string;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  notes: string | null;
}
