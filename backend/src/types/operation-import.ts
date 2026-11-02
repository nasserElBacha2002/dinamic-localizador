import type { ScheduleSource } from "../constants/schedule-source";
import type { WeeklyScheduleDay } from "./schedule";

export type OperationImportRowStatus = "valid" | "invalid";
export type OperationImportFormat = "client" | "legacy" | "recurring" | "canonical";
export type OperationImportScheduleMode = "SINGLE" | "MULTI_SHIFT";

export interface OperationImportRecurringShiftConfirmInput {
  code: string;
  name: string;
  templateId?: string | null;
  sortOrder?: number;
  startTime: string;
  endTime: string;
  days: { dayOfWeek: number; isEnabled: boolean }[];
}

/** Shift seed with canonical sortOrder assigned server-side before persist. */
export interface OperationImportRecurringShiftConfirmSeed extends OperationImportRecurringShiftConfirmInput {
  sortOrder: number;
}

export interface OperationImportPreviewRow {
  rowNumber: number;
  format: OperationImportFormat;
  operationKind: "ONE_TIME" | "RECURRING";
  scheduleMode: OperationImportScheduleMode;
  multiShiftGroupKey: string | null;
  shiftCode: string | null;
  shiftName: string | null;
  shiftTemplateId: string | null;
  shiftTemplateSortOrder: number | null;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  shiftDays: { dayOfWeek: number; isEnabled: boolean }[] | null;
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
  scheduleSource: ScheduleSource | null;
  scheduleTimezone: string | null;
  scheduleDays: WeeklyScheduleDay[] | null;
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
  fileType: "csv" | "xlsx" | null;
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
  scheduleMode?: OperationImportScheduleMode;
  multiShiftGroupKey?: string;
  serviceId: string;
  validFrom: string;
  validUntil: string | null;
  scheduleSource: ScheduleSource;
  scheduleDays?: WeeklyScheduleDay[];
  /** One shift per import row (MULTI_SHIFT). */
  shift?: OperationImportRecurringShiftConfirmInput;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  earlyToleranceSource?: "COMPANY_DEFAULT" | "CUSTOM";
  lateToleranceSource?: "COMPANY_DEFAULT" | "CUSTOM";
}

/** Internal shape produced by collapsing MULTI_SHIFT confirm rows (not accepted on confirm API). */
export interface OperationImportRecurringMultiShiftCollapsedRow {
  operationKind: "RECURRING";
  scheduleMode: "MULTI_SHIFT";
  multiShiftGroupKey?: string;
  serviceId: string;
  validFrom: string;
  validUntil: string | null;
  scheduleSource: ScheduleSource;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  earlyToleranceSource?: "COMPANY_DEFAULT" | "CUSTOM";
  lateToleranceSource?: "COMPANY_DEFAULT" | "CUSTOM";
  shifts: OperationImportRecurringShiftConfirmSeed[];
}

export type OperationImportRecurringCollapsedConfirmRow =
  | OperationImportRecurringConfirmRow
  | OperationImportRecurringMultiShiftCollapsedRow;

export const isMultiShiftCollapsedImportRow = (
  row: OperationImportRecurringCollapsedConfirmRow,
): row is OperationImportRecurringMultiShiftCollapsedRow =>
  row.scheduleMode === "MULTI_SHIFT" && "shifts" in row && Array.isArray(row.shifts);

export type OperationImportConfirmRow =
  | OperationImportOneTimeConfirmRow
  | OperationImportRecurringConfirmRow;

export const isRecurringImportConfirmRow = (
  row: OperationImportConfirmRow,
): row is OperationImportRecurringConfirmRow => row.operationKind === "RECURRING";
