export type ImportEntityType = "operations" | "services" | "employees";

export type ImportRowStatus = "valid" | "invalid" | "warning";
export type ImportExecuteRowStatus = "created" | "updated" | "rejected";
export type ImportJobStatus =
  | "VALIDATING"
  | "READY"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED";

export interface ImportRowError {
  field: string | null;
  value: string | null;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface ImportPreviewRow {
  rowNumber: number;
  status: ImportRowStatus;
  values: Record<string, string>;
  errors: ImportRowError[];
}

export interface ImportPreviewSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  canConfirm: boolean;
  createdEstimate: number;
  updatedEstimate: number;
}

export interface ImportPreviewResult {
  entityType: ImportEntityType;
  fileType: "csv" | "xlsx" | null;
  format: string | null;
  summary: ImportPreviewSummary;
  rows: ImportPreviewRow[];
  fileErrors: string[];
  displayColumns: Array<{ key: string; header: string }>;
  importJobId: string;
  confirmationToken: string;
  fileHash: string;
  strategyVersion: string;
  expiresAt: string;
}

export interface ImportExecuteRow {
  rowNumber: number;
  status: ImportExecuteRowStatus;
  values: Record<string, string>;
  errors: ImportRowError[];
}

export interface ImportExecuteSummary {
  totalRows: number;
  processedRows: number;
  created: number;
  updated: number;
  rejected: number;
  durationMs: number;
}

export interface ImportExecuteResult {
  entityType: ImportEntityType;
  summary: ImportExecuteSummary;
  rows: ImportExecuteRow[];
  fileErrors: string[];
  importJobId?: string;
  status?: ImportJobStatus | string;
}

export interface ImportFilePayload {
  fileName: string;
  fileContentBase64: string;
  idempotencyKey?: string | null;
}

export interface ImportExecutePayload {
  importJobId: string;
  confirmationToken: string;
  idempotencyKey?: string | null;
  forceNew?: boolean;
}
