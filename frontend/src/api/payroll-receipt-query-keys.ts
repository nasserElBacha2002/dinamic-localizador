import type { PayrollReceiptBatchFilters, PayrollReceiptFilters } from "../types/payroll-receipt";

export const payrollReceiptKeys = {
  all: ["payroll-receipts"] as const,
  company: (companyId: string | null | undefined) =>
    [...payrollReceiptKeys.all, "company", companyId ?? "none"] as const,
  lists: (companyId: string | null | undefined) =>
    [...payrollReceiptKeys.company(companyId), "list"] as const,
  list: (companyId: string | null | undefined, filters: PayrollReceiptFilters) =>
    [...payrollReceiptKeys.lists(companyId), filters] as const,
  details: (companyId: string | null | undefined) =>
    [...payrollReceiptKeys.company(companyId), "detail"] as const,
  detail: (companyId: string | null | undefined, receiptId: string) =>
    [...payrollReceiptKeys.details(companyId), receiptId] as const,
  batches: (companyId: string | null | undefined) =>
    [...payrollReceiptKeys.company(companyId), "batches"] as const,
  batchList: (companyId: string | null | undefined, filters: PayrollReceiptBatchFilters) =>
    [...payrollReceiptKeys.batches(companyId), "list", filters] as const,
  batch: (companyId: string | null | undefined, batchId: string) =>
    [...payrollReceiptKeys.batches(companyId), batchId] as const,
};
