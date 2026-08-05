import type { TableUrlFieldMap } from "../../utils/table-url-state";
import type { PayrollReceiptStatus } from "../../types/payroll-receipt";

export const PAYROLL_RECEIPT_STATUS_VALUES = [
  "all",
  "PENDING",
  "UPLOADING",
  "ASSOCIATED",
  "DOCUMENT_NOT_FOUND",
  "INVALID_DOCUMENT",
  "AMBIGUOUS_DOCUMENT",
  "EMPLOYEE_NOT_FOUND",
  "EMPLOYEE_DOCUMENT_AMBIGUOUS",
  "DUPLICATE",
  "UPLOAD_FAILED",
  "FAILED",
  "REPLACED",
  "DELETED",
] as const;

export type PayrollReceiptListStatusFilter = (typeof PAYROLL_RECEIPT_STATUS_VALUES)[number];

export const PAYROLL_RECEIPTS_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 20,
  status: "all" as PayrollReceiptListStatusFilter,
  year: "",
  month: "",
  employeeIds: [] as string[],
  search: "",
  document: "",
};

export const PAYROLL_RECEIPTS_TABLE_FIELDS = {
  status: { type: "enum", values: PAYROLL_RECEIPT_STATUS_VALUES },
  employeeIds: { type: "stringList" as const },
} satisfies TableUrlFieldMap<typeof PAYROLL_RECEIPTS_TABLE_DEFAULTS>;

export const shouldOmitPayrollReceiptsTableValue = (
  key: keyof typeof PAYROLL_RECEIPTS_TABLE_DEFAULTS,
  value: (typeof PAYROLL_RECEIPTS_TABLE_DEFAULTS)[keyof typeof PAYROLL_RECEIPTS_TABLE_DEFAULTS],
  defaults: typeof PAYROLL_RECEIPTS_TABLE_DEFAULTS,
): boolean => {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return value === defaults[key] || value === "";
};

export function parseOptionalYearMonth(
  year: string,
  month: string,
): { year?: number; month?: number } {
  const parsedYear = year ? Number.parseInt(year, 10) : NaN;
  const parsedMonth = month ? Number.parseInt(month, 10) : NaN;
  return {
    year: Number.isFinite(parsedYear) && parsedYear >= 2000 ? parsedYear : undefined,
    month:
      Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
        ? parsedMonth
        : undefined,
  };
}

export type { PayrollReceiptStatus };
