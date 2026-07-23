export type ImportRowStatus = "valid" | "invalid" | "warning";
export type ImportErrorSeverity = "error" | "warning";
export type ImportExecuteRowStatus = "created" | "updated" | "rejected";

export interface ImportRowError {
  field: string | null;
  value: string | null;
  code: string;
  message: string;
  severity: ImportErrorSeverity;
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
  entityType: string;
  fileType: "csv" | "xlsx" | null;
  format: string | null;
  summary: ImportPreviewSummary;
  rows: ImportPreviewRow[];
  fileErrors: string[];
  displayColumns: Array<{ key: string; header: string }>;
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
  entityType: string;
  summary: ImportExecuteSummary;
  rows: ImportExecuteRow[];
  fileErrors: string[];
}

export interface ImportColumnDefinition {
  key: string;
  header: string;
  required: boolean;
  aliases?: string[];
}

export interface ImportTemplate {
  fileName: string;
  contentType: string;
  body: Buffer;
}
