import { Router } from "express";
import { payrollReceiptController } from "../controllers/payroll-receipt.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { acceptSingleMultipartFileStream } from "../middleware/multipart-file-stream";
import { validate } from "../middleware/validate";
import {
  createPayrollReceiptBatchSchema,
  downloadPayrollReceiptQuerySchema,
  listPayrollReceiptBatchesQuerySchema,
  listPayrollReceiptsQuerySchema,
  payrollReceiptBatchIdParamSchema,
  payrollReceiptIdParamSchema,
} from "../schemas/payroll-receipt.schema";

export const payrollReceiptBatchRouter = Router({ mergeParams: true });
export const payrollReceiptRouter = Router({ mergeParams: true });

payrollReceiptBatchRouter.post(
  "/",
  requirePermission("payroll_receipts:upload"),
  validate(createPayrollReceiptBatchSchema, "body"),
  asyncHandler(payrollReceiptController.createBatch),
);

payrollReceiptBatchRouter.get(
  "/",
  requirePermission("payroll_receipts:read"),
  validate(listPayrollReceiptBatchesQuerySchema, "query"),
  asyncHandler(payrollReceiptController.listBatches),
);

payrollReceiptBatchRouter.get(
  "/:batchId",
  requirePermission("payroll_receipts:read"),
  validate(payrollReceiptBatchIdParamSchema, "params"),
  asyncHandler(payrollReceiptController.getBatch),
);

payrollReceiptBatchRouter.post(
  "/:batchId/receipts",
  requirePermission("payroll_receipts:upload"),
  validate(payrollReceiptBatchIdParamSchema, "params"),
  acceptSingleMultipartFileStream("file"),
  asyncHandler(payrollReceiptController.uploadToBatch),
);

payrollReceiptRouter.get(
  "/",
  requirePermission("payroll_receipts:read"),
  validate(listPayrollReceiptsQuerySchema, "query"),
  asyncHandler(payrollReceiptController.listReceipts),
);

payrollReceiptRouter.get(
  "/:id",
  requirePermission("payroll_receipts:read"),
  validate(payrollReceiptIdParamSchema, "params"),
  asyncHandler(payrollReceiptController.getReceipt),
);

payrollReceiptRouter.get(
  "/:id/content",
  requirePermission("payroll_receipts:download"),
  validate(payrollReceiptIdParamSchema, "params"),
  validate(downloadPayrollReceiptQuerySchema, "query"),
  asyncHandler(payrollReceiptController.download),
);

payrollReceiptRouter.post(
  "/:id/replace",
  requirePermission("payroll_receipts:manage"),
  validate(payrollReceiptIdParamSchema, "params"),
  acceptSingleMultipartFileStream("file"),
  asyncHandler(payrollReceiptController.replace),
);

payrollReceiptRouter.delete(
  "/:id",
  requirePermission("payroll_receipts:delete"),
  validate(payrollReceiptIdParamSchema, "params"),
  asyncHandler(payrollReceiptController.remove),
);

payrollReceiptRouter.post(
  "/:id/reconcile-association",
  requirePermission("payroll_receipts:upload"),
  validate(payrollReceiptIdParamSchema, "params"),
  asyncHandler(payrollReceiptController.reconcileAssociation),
);
