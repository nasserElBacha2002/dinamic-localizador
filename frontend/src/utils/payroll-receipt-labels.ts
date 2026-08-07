import type {
  PayrollReceiptBatchStatus,
  PayrollReceiptStatus,
} from "../types/payroll-receipt";
import type { StatusBadgeTone } from "../design-system/components/StatusBadge";

export const payrollReceiptStatusLabels: Record<PayrollReceiptStatus, string> = {
  PENDING: "Pendiente",
  UPLOADING: "Subiendo",
  ASSOCIATED: "Asociado",
  DOCUMENT_NOT_FOUND: "CUIL no encontrado",
  INVALID_DOCUMENT: "CUIL inválido",
  AMBIGUOUS_DOCUMENT: "CUIL ambiguo",
  EMPLOYEE_NOT_FOUND: "Colaborador no encontrado",
  EMPLOYEE_DOCUMENT_AMBIGUOUS: "CUIL de colaborador ambiguo",
  DUPLICATE: "Archivo duplicado",
  UPLOAD_FAILED: "Error de carga",
  FAILED: "Fallido",
  REPLACED: "Reemplazado",
  DELETED: "Eliminado",
};

export const payrollReceiptBatchStatusLabels: Record<PayrollReceiptBatchStatus, string> = {
  DRAFT: "Borrador",
  PROCESSING: "Procesando",
  COMPLETED: "Completado",
  COMPLETED_WITH_ERRORS: "Completado con errores",
  FAILED: "Fallido",
};

export const PAYROLL_MONTH_LABELS: Record<number, string> = {
  1: "Enero",
  2: "Febrero",
  3: "Marzo",
  4: "Abril",
  5: "Mayo",
  6: "Junio",
  7: "Julio",
  8: "Agosto",
  9: "Septiembre",
  10: "Octubre",
  11: "Noviembre",
  12: "Diciembre",
};

export function formatPayrollPeriod(year: number, month: number): string {
  const monthLabel = PAYROLL_MONTH_LABELS[month] ?? String(month);
  return `${monthLabel} ${year}`;
}

/** Display-only CUIL formatting: XX-XXXXXXXX-X */
export function formatCuilDisplay(normalized: string | null | undefined): string {
  if (normalized == null || normalized.trim() === "") {
    return "—";
  }
  const digits = String(normalized).replace(/\D/g, "");
  if (digits.length !== 11) {
    return String(normalized);
  }
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

export function payrollReceiptStatusTone(status: PayrollReceiptStatus): StatusBadgeTone {
  switch (status) {
    case "ASSOCIATED":
      return "success";
    case "PENDING":
    case "UPLOADING":
      return "info";
    case "DUPLICATE":
    case "REPLACED":
      return "warning";
    case "DELETED":
      return "neutral";
    default:
      return "danger";
  }
}

/**
 * Lightweight client-side CUIL preview from a filename (no checksum).
 * Prefer 11 consecutive digits, then formatted XX-XXXXXXXX-X patterns.
 */
export function previewCuilFromFilename(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const withoutExt = base.replace(/\.[^.]+$/, "");

  const plain = withoutExt.match(/\d{11}/);
  if (plain?.[0]) {
    return plain[0];
  }

  const formatted = withoutExt.match(/\d{2}[\s.-]*\d{8}[\s.-]*\d/);
  if (formatted?.[0]) {
    const digits = formatted[0].replace(/\D/g, "");
    return digits.length === 11 ? digits : null;
  }

  return null;
}

export type UploadOutcomeKind = "associated" | "duplicate" | "failed" | "network" | "pending";

export function classifyPayrollUploadOutcome(
  status: PayrollReceiptStatus | "ERROR" | "PENDING" | null | undefined,
): UploadOutcomeKind {
  if (status == null || status === "PENDING" || status === "UPLOADING") {
    return "pending";
  }
  if (status === "ASSOCIATED") {
    return "associated";
  }
  if (status === "DUPLICATE") {
    return "duplicate";
  }
  if (status === "ERROR") {
    return "network";
  }
  return "failed";
}

export type UploadBatchSummary = {
  total: number;
  associated: number;
  duplicates: number;
  failed: number;
  networkErrors: number;
  pending: number;
};

export function summarizePayrollUploadOutcomes(
  statuses: Array<PayrollReceiptStatus | "ERROR" | "PENDING" | null | undefined>,
): UploadBatchSummary {
  const summary: UploadBatchSummary = {
    total: statuses.length,
    associated: 0,
    duplicates: 0,
    failed: 0,
    networkErrors: 0,
    pending: 0,
  };
  for (const status of statuses) {
    const kind = classifyPayrollUploadOutcome(status);
    if (kind === "associated") summary.associated += 1;
    else if (kind === "duplicate") summary.duplicates += 1;
    else if (kind === "network") summary.networkErrors += 1;
    else if (kind === "pending") summary.pending += 1;
    else summary.failed += 1;
  }
  return summary;
}

/** Spanish alert for batch upload completion based on domain outcomes. */
export function payrollUploadCompletionMessage(summary: UploadBatchSummary): {
  color: "green" | "yellow" | "red";
  message: string;
} {
  const rejected = summary.failed + summary.networkErrors;
  if (summary.total === 0) {
    return { color: "yellow", message: "No se procesaron archivos." };
  }
  if (summary.associated === summary.total) {
    return { color: "green", message: "Carga finalizada correctamente. Todos los recibos fueron asociados." };
  }
  if (summary.associated === 0 && rejected + summary.duplicates === summary.total) {
    return {
      color: "red",
      message: `Ningún recibo fue asociado (${summary.duplicates} archivo${summary.duplicates === 1 ? "" : "s"} idéntico${summary.duplicates === 1 ? "" : "s"} ya existente${summary.duplicates === 1 ? "" : "s"}, ${rejected} fallido${rejected === 1 ? "" : "s"}). Revisá el detalle.`,
    };
  }
  return {
    color: "yellow",
    message: `Carga completada con observaciones: ${summary.associated} asociado${summary.associated === 1 ? "" : "s"}, ${summary.duplicates} archivo${summary.duplicates === 1 ? "" : "s"} idéntico${summary.duplicates === 1 ? "" : "s"}, ${rejected} fallido${rejected === 1 ? "" : "s"}.`,
  };
}
