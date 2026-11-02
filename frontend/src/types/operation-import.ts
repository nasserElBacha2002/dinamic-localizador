export type OperationImportRowStatus = "valid" | "invalid";
export type OperationImportFormat = "client" | "legacy" | "recurring";
export type OperationImportFileType = "csv" | "xlsx";

export interface OperationImportPreviewRow {
  rowNumber: number;
  format: OperationImportFormat;
  operationKind: "ONE_TIME" | "RECURRING";
  punto: string;
  legacyLocation: string;
  serviceId: string | null;
  serviceName: string | null;
  rawFecha: string;
  parsedOperationDate: string | null;
  fechaInicio: string;
  fechaFin: string;
  validFrom: string | null;
  validUntil: string | null;
  scheduleSource: "COMPANY" | "CUSTOM" | null;
  scheduleTimezone: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledStartDisplay: string;
  scheduledEndDisplay: string;
  toleranciaTemprana: string;
  toleranciaTardia: string;
  earlyToleranceMinutes: number | null;
  lateToleranceMinutes: number | null;
  earlyToleranceSource: "COMPANY_DEFAULT" | "CUSTOM";
  lateToleranceSource: "COMPANY_DEFAULT" | "CUSTOM";
  earlyToleranceDisplay: string;
  lateToleranceDisplay: string;
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
  fileType: OperationImportFileType | null;
  summary: OperationImportPreviewSummary;
  rows: OperationImportPreviewRow[];
  fileErrors: string[];
}

export interface OperationImportOneTimeConfirmRow {
  operationKind?: "ONE_TIME";
  serviceId: string;
  scheduledStart: string;
  scheduledEnd: string;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  earlyToleranceSource?: "COMPANY_DEFAULT" | "CUSTOM";
  lateToleranceSource?: "COMPANY_DEFAULT" | "CUSTOM";
}

export interface OperationImportRecurringConfirmRow {
  operationKind: "RECURRING";
  serviceId: string;
  validFrom: string;
  validUntil: string | null;
  scheduleSource: "COMPANY" | "CUSTOM";
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  earlyToleranceSource?: "COMPANY_DEFAULT" | "CUSTOM";
  lateToleranceSource?: "COMPANY_DEFAULT" | "CUSTOM";
}

export type OperationImportConfirmRow =
  | OperationImportOneTimeConfirmRow
  | OperationImportRecurringConfirmRow;

export interface OperationImportPreviewPayload {
  fileName: string;
  fileContentBase64: string;
}
