import { z } from "zod";
import type { PayrollReceiptStatus } from "../types/payroll-receipt";
import { assertWithinMultiFilterLimit, mergeLegacySingularId, uuidIdListSchema } from "./uuid-id-list";

export const payrollReceiptStatusSchema = z.enum([
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
]);

export const createPayrollReceiptBatchSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const listPayrollReceiptBatchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const payrollReceiptBatchIdParamSchema = z.object({
  batchId: z.string().uuid("UUID de lote inválido"),
});

export const payrollReceiptIdParamSchema = z.object({
  id: z.string().uuid("UUID de recibo inválido"),
});

export const listPayrollReceiptsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    employeeId: z.string().uuid().optional(),
    employeeIds: uuidIdListSchema.optional(),
    status: payrollReceiptStatusSchema.optional(),
    search: z.string().trim().min(1).max(150).optional(),
    document: z.string().trim().min(1).max(20).optional(),
    batchId: z.string().uuid().optional(),
  })
  .transform((query) => ({
    ...query,
    employeeIds: assertWithinMultiFilterLimit(
      mergeLegacySingularId(query.employeeIds ?? [], query.employeeId),
    ),
  }));

export const downloadPayrollReceiptQuerySchema = z.object({
  disposition: z.enum(["inline", "attachment"]).default("attachment"),
});

export type CreatePayrollReceiptBatchInput = z.infer<typeof createPayrollReceiptBatchSchema>;
export type ListPayrollReceiptBatchesQuery = z.infer<typeof listPayrollReceiptBatchesQuerySchema>;
export type ListPayrollReceiptsQuery = z.infer<typeof listPayrollReceiptsQuerySchema>;

export type { PayrollReceiptStatus };
