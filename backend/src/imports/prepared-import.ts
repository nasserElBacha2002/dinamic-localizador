import { createHash, randomUUID } from "node:crypto";
import type { ImportEntityType } from "./constants";
import type {
  ImportExecuteResult,
  ImportPreviewResult,
  ImportPreviewRow,
  ImportRowError,
} from "./types";

export const IMPORT_STRATEGY_VERSION = "2026-07-23.1";

export type ImportJobStatus =
  | "VALIDATING"
  | "READY"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED";

export type EmployeeCreationMode = "interactive" | "import";

export interface PreparedImportRow {
  rowNumber: number;
  values: Record<string, string>;
  errors: ImportRowError[];
  /** Strategy-specific typed payload for persistence when the row is valid. */
  payload: unknown | null;
}

export interface PreparedImport {
  entityType: ImportEntityType;
  strategyVersion: string;
  fileName: string;
  fileHash: string;
  fileType: "csv" | "xlsx" | null;
  format: string | null;
  requireAllRowsValid: boolean;
  displayColumns: Array<{ key: string; header: string }>;
  fileErrors: string[];
  rows: PreparedImportRow[];
  summary: ImportPreviewResult["summary"];
}

export const hashImportFile = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex");

export const createConfirmationToken = (): string => randomUUID();

export const preparedToPreviewResult = (prepared: PreparedImport): ImportPreviewResult => ({
  entityType: prepared.entityType,
  fileType: prepared.fileType,
  format: prepared.format,
  summary: prepared.summary,
  rows: prepared.rows.map(
    (row): ImportPreviewRow => ({
      rowNumber: row.rowNumber,
      status: row.errors.length === 0 ? "valid" : "invalid",
      values: row.values,
      errors: row.errors,
    }),
  ),
  fileErrors: prepared.fileErrors,
  displayColumns: prepared.displayColumns,
});

export const resolveImportOutcomeStatus = (
  created: number,
  rejected: number,
): "COMPLETED" | "PARTIAL" | "FAILED" => {
  if (created > 0 && rejected === 0) {
    return "COMPLETED";
  }
  if (created > 0 && rejected > 0) {
    return "PARTIAL";
  }
  return "FAILED";
};

export type PersistRowOutcome = {
  rowNumber: number;
  status: "created" | "updated" | "rejected";
  values: Record<string, string>;
  errors: ImportRowError[];
};

export const buildExecuteResult = (input: {
  entityType: ImportEntityType;
  totalRows: number;
  outcomes: PersistRowOutcome[];
  fileErrors: string[];
  durationMs: number;
}): ImportExecuteResult => {
  const created = input.outcomes.filter((row) => row.status === "created").length;
  const updated = input.outcomes.filter((row) => row.status === "updated").length;
  const rejected = input.outcomes.filter((row) => row.status === "rejected").length;

  return {
    entityType: input.entityType,
    summary: {
      totalRows: input.totalRows,
      processedRows: created + updated + rejected,
      created,
      updated,
      rejected,
      durationMs: input.durationMs,
    },
    rows: [...input.outcomes].sort((a, b) => a.rowNumber - b.rowNumber),
    fileErrors: input.fileErrors,
  };
};
