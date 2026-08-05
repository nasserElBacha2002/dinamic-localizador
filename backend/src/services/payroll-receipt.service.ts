import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { employeeRepository } from "../repositories/employee.repository";
import { payrollReceiptRepository } from "../repositories/payroll-receipt.repository";
import { pendingStorageDeletionRepository } from "../repositories/pending-storage-deletion.repository";
import type {
  PayrollReceipt,
  PayrollReceiptBatch,
  PayrollReceiptBatchDto,
  PayrollReceiptDto,
  PayrollReceiptStatus,
} from "../types/payroll-receipt";
import { toPayrollReceiptBatchDto, toPayrollReceiptDto } from "../types/payroll-receipt";
import type {
  CreatePayrollReceiptBatchInput,
  ListPayrollReceiptBatchesQuery,
  ListPayrollReceiptsQuery,
} from "../schemas/payroll-receipt.schema";
import { buildPaginationMeta } from "../utils/pagination";
import {
  extractAndValidateDocumentFromFilename,
  maskDocumentForLog,
} from "../utils/payroll-receipts/extract-document-from-filename";
import {
  assertPayrollReceiptPdfMetadata,
  buildPayrollReceiptObjectKey,
  newPayrollReceiptId,
  sanitizeOriginalFileName,
} from "../utils/payroll-receipts/file-validation";
import { payrollReceiptMetrics } from "../utils/payroll-receipts/metrics";
import { PayrollPdfUploadTransform } from "../utils/payroll-receipts/streaming-upload-transform";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { buildContentDisposition } from "../utils/absence-attachments/content-disposition";
import { auditService } from "./audit.service";
import { getAttachmentStorage } from "./attachment-storage";

const destroyQuietly = (stream: Readable | null | undefined): void => {
  if (!stream || stream.destroyed) {
    return;
  }
  try {
    stream.destroy();
  } catch {
    /* ignore */
  }
};

const resolveEmployeeForDocument = async (
  companyId: string,
  normalizedDocument: string,
): Promise<
  | { outcome: "found"; employeeId: string }
  | { outcome: "not_found" }
  | { outcome: "ambiguous" }
> => {
  const matches = await employeeRepository.findByNormalizedDocument(
    companyId,
    normalizedDocument,
  );
  const active = matches.filter((e) => e.active);
  const pool = active.length > 0 ? active : matches;

  if (pool.length === 0) {
    return { outcome: "not_found" };
  }
  if (active.length > 1) {
    return { outcome: "ambiguous" };
  }
  if (pool.length > 1 && active.length === 0) {
    return { outcome: "ambiguous" };
  }
  return { outcome: "found", employeeId: pool[0]!.id };
};

type UploadReceiptInput = {
  companyId: string;
  batchId: string;
  body: Readable;
  originalFileName: string;
  declaredContentType: string;
  uploadedByUserId: string;
  idempotencyKey: string;
  signal?: AbortSignal;
  /** When replacing, soft receipt id to mark REPLACED after success. */
  replaceReceiptId?: string;
};

const recordTerminalWithoutUpload = async (input: {
  companyId: string;
  batchId: string;
  year: number;
  month: number;
  originalFilename: string;
  status: PayrollReceiptStatus;
  errorCode: string;
  errorMessage: string;
  detectedDocument?: string | null;
  normalizedDocument?: string | null;
  employeeId?: string | null;
  uploadedByUserId: string;
  idempotencyKey: string;
  replacedReceiptId?: string | null;
}): Promise<PayrollReceipt> => {
  const receipt = await payrollReceiptRepository.createPending({
    id: newPayrollReceiptId(),
    companyId: input.companyId,
    batchId: input.batchId,
    year: input.year,
    month: input.month,
    originalFilename: input.originalFilename,
    status: input.status,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    detectedDocument: input.detectedDocument ?? null,
    normalizedDocument: input.normalizedDocument ?? null,
    employeeId: input.employeeId ?? null,
    uploadedByUserId: input.uploadedByUserId,
    idempotencyKey: input.idempotencyKey,
    replacedReceiptId: input.replacedReceiptId ?? null,
  });
  await payrollReceiptRepository.refreshBatchStatus(input.companyId, input.batchId);
  return receipt;
};

const compensateDeleteObject = async (objectKey: string): Promise<void> => {
  try {
    await getAttachmentStorage().deleteObject({ objectKey });
  } catch {
    payrollReceiptMetrics.deleteFailed({ operation: "compensate_delete", errorCode: "GCS_DELETE" });
  }
};

export const payrollReceiptService = {
  async createBatch(
    companyId: string,
    input: CreatePayrollReceiptBatchInput,
    createdByUserId: string,
  ): Promise<PayrollReceiptBatchDto> {
    const batch = await payrollReceiptRepository.createBatch({
      id: randomUUID(),
      companyId,
      year: input.year,
      month: input.month,
      status: "PROCESSING",
      createdByUserId,
    });

    await auditService.log(companyId, {
      userId: createdByUserId,
      action: "PAYROLL_BATCH_CREATED",
      entityType: "payroll_receipt_batch",
      entityId: batch.id,
      newData: { year: batch.year, month: batch.month, status: batch.status },
    });

    payrollReceiptMetrics.batchCreated({
      operation: "create_batch",
      year: batch.year,
      month: batch.month,
    });

    return toPayrollReceiptBatchDto(batch);
  },

  async listBatches(
    companyId: string,
    query: ListPayrollReceiptBatchesQuery,
  ): Promise<{ data: PayrollReceiptBatchDto[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const { items, total } = await payrollReceiptRepository.listBatches(companyId, query);
    return {
      data: items.map(toPayrollReceiptBatchDto),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  },

  async getBatch(
    companyId: string,
    batchId: string,
  ): Promise<{ batch: PayrollReceiptBatchDto; receipts: PayrollReceiptDto[] }> {
    const batch = await payrollReceiptRepository.findBatchById(companyId, batchId);
    if (!batch) {
      throw new AppError(404, "PAYROLL_BATCH_NOT_FOUND", "Lote de recibos no encontrado");
    }
    const receipts = await payrollReceiptRepository.listReceiptsByBatch(companyId, batchId);
    return {
      batch: toPayrollReceiptBatchDto(batch),
      receipts: receipts.map(toPayrollReceiptDto),
    };
  },

  async listReceipts(
    companyId: string,
    query: ListPayrollReceiptsQuery,
  ): Promise<{ data: PayrollReceiptDto[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const { items, total } = await payrollReceiptRepository.list(companyId, query);
    return {
      data: items.map(toPayrollReceiptDto),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  },

  async getReceipt(companyId: string, receiptId: string): Promise<PayrollReceiptDto> {
    const receipt = await payrollReceiptRepository.findById(companyId, receiptId);
    if (!receipt || receipt.deletedAt) {
      throw new AppError(404, "PAYROLL_RECEIPT_NOT_FOUND", "Recibo no encontrado");
    }
    return toPayrollReceiptDto(receipt);
  },

  async uploadReceipt(input: UploadReceiptInput): Promise<PayrollReceiptDto> {
    const batch = await payrollReceiptRepository.findBatchById(input.companyId, input.batchId);
    if (!batch) {
      destroyQuietly(input.body);
      throw new AppError(404, "PAYROLL_BATCH_NOT_FOUND", "Lote de recibos no encontrado");
    }

    const existingKey = await payrollReceiptRepository.findByIdempotencyKey(
      input.companyId,
      input.batchId,
      input.idempotencyKey,
    );
    if (existingKey) {
      destroyQuietly(input.body);
      return toPayrollReceiptDto(existingKey);
    }

    const maxFiles = env.PAYROLL_RECEIPTS_MAX_FILES_PER_BATCH;
    const reserved = await payrollReceiptRepository.tryReserveBatchSlot({
      companyId: input.companyId,
      batchId: input.batchId,
      maxFiles,
    });
    if (!reserved) {
      destroyQuietly(input.body);
      throw new AppError(
        400,
        "PAYROLL_BATCH_FILE_LIMIT",
        `El lote supera el máximo de ${maxFiles} archivos`,
      );
    }

    const releaseSlot = async () => {
      try {
        await payrollReceiptRepository.releaseBatchSlot(input.companyId, input.batchId);
      } catch {
        /* refreshBatchStatus will reconcile totals */
      }
    };

    const sanitizedName = sanitizeOriginalFileName(input.originalFileName);
    const extraction = extractAndValidateDocumentFromFilename(sanitizedName);

    if (extraction.outcome === "not_found") {
      destroyQuietly(input.body);
      const row = await recordTerminalWithoutUpload({
        companyId: input.companyId,
        batchId: input.batchId,
        year: batch.year,
        month: batch.month,
        originalFilename: sanitizedName,
        status: "DOCUMENT_NOT_FOUND",
        errorCode: "DOCUMENT_NOT_FOUND",
        errorMessage: "No se encontró CUIL/CUIT en el nombre del archivo",
        uploadedByUserId: input.uploadedByUserId,
        idempotencyKey: input.idempotencyKey,
        replacedReceiptId: input.replaceReceiptId ?? null,
      });
      await auditService.log(input.companyId, {
        userId: input.uploadedByUserId,
        action: "PAYROLL_RECEIPT_FAILED",
        entityType: "payroll_receipt",
        entityId: row.id,
        newData: { status: row.status, errorCode: row.errorCode },
      });
      return toPayrollReceiptDto(row);
    }

    if (extraction.outcome === "invalid") {
      destroyQuietly(input.body);
      const row = await recordTerminalWithoutUpload({
        companyId: input.companyId,
        batchId: input.batchId,
        year: batch.year,
        month: batch.month,
        originalFilename: sanitizedName,
        status: "INVALID_DOCUMENT",
        errorCode: "INVALID_DOCUMENT",
        errorMessage: extraction.reason,
        uploadedByUserId: input.uploadedByUserId,
        idempotencyKey: input.idempotencyKey,
        replacedReceiptId: input.replaceReceiptId ?? null,
      });
      await auditService.log(input.companyId, {
        userId: input.uploadedByUserId,
        action: "PAYROLL_RECEIPT_FAILED",
        entityType: "payroll_receipt",
        entityId: row.id,
        newData: { status: row.status, errorCode: row.errorCode },
      });
      return toPayrollReceiptDto(row);
    }

    if (extraction.outcome === "ambiguous") {
      destroyQuietly(input.body);
      const row = await recordTerminalWithoutUpload({
        companyId: input.companyId,
        batchId: input.batchId,
        year: batch.year,
        month: batch.month,
        originalFilename: sanitizedName,
        status: "AMBIGUOUS_DOCUMENT",
        errorCode: "AMBIGUOUS_DOCUMENT",
        errorMessage: "Se encontraron múltiples CUIL/CUIT válidos en el nombre del archivo",
        uploadedByUserId: input.uploadedByUserId,
        idempotencyKey: input.idempotencyKey,
        replacedReceiptId: input.replaceReceiptId ?? null,
      });
      await auditService.log(input.companyId, {
        userId: input.uploadedByUserId,
        action: "PAYROLL_RECEIPT_FAILED",
        entityType: "payroll_receipt",
        entityId: row.id,
        newData: { status: row.status, errorCode: row.errorCode },
      });
      return toPayrollReceiptDto(row);
    }

    const { normalizedDocument, detectedRaw } = extraction;
    const documentMasked = maskDocumentForLog(normalizedDocument);

    const employeeMatch = await resolveEmployeeForDocument(
      input.companyId,
      normalizedDocument,
    );

    if (employeeMatch.outcome === "not_found") {
      destroyQuietly(input.body);
      const row = await recordTerminalWithoutUpload({
        companyId: input.companyId,
        batchId: input.batchId,
        year: batch.year,
        month: batch.month,
        originalFilename: sanitizedName,
        status: "EMPLOYEE_NOT_FOUND",
        errorCode: "EMPLOYEE_NOT_FOUND",
        errorMessage: "No hay colaborador con ese documento en la empresa",
        detectedDocument: detectedRaw,
        normalizedDocument,
        uploadedByUserId: input.uploadedByUserId,
        idempotencyKey: input.idempotencyKey,
        replacedReceiptId: input.replaceReceiptId ?? null,
      });
      await auditService.log(input.companyId, {
        userId: input.uploadedByUserId,
        action: "PAYROLL_RECEIPT_FAILED",
        entityType: "payroll_receipt",
        entityId: row.id,
        newData: { status: row.status, documentMasked },
      });
      return toPayrollReceiptDto(row);
    }

    if (employeeMatch.outcome === "ambiguous") {
      destroyQuietly(input.body);
      const row = await recordTerminalWithoutUpload({
        companyId: input.companyId,
        batchId: input.batchId,
        year: batch.year,
        month: batch.month,
        originalFilename: sanitizedName,
        status: "EMPLOYEE_DOCUMENT_AMBIGUOUS",
        errorCode: "EMPLOYEE_DOCUMENT_AMBIGUOUS",
        errorMessage: "Hay más de un colaborador activo con el mismo documento",
        detectedDocument: detectedRaw,
        normalizedDocument,
        uploadedByUserId: input.uploadedByUserId,
        idempotencyKey: input.idempotencyKey,
        replacedReceiptId: input.replaceReceiptId ?? null,
      });
      await auditService.log(input.companyId, {
        userId: input.uploadedByUserId,
        action: "PAYROLL_RECEIPT_FAILED",
        entityType: "payroll_receipt",
        entityId: row.id,
        newData: { status: row.status, documentMasked },
      });
      return toPayrollReceiptDto(row);
    }

    const employeeId = employeeMatch.employeeId;

    if (!input.replaceReceiptId) {
      const existingAssociated = await payrollReceiptRepository.findActiveAssociated(
        input.companyId,
        employeeId,
        batch.year,
        batch.month,
      );
      if (existingAssociated) {
        destroyQuietly(input.body);
        const row = await recordTerminalWithoutUpload({
          companyId: input.companyId,
          batchId: input.batchId,
          year: batch.year,
          month: batch.month,
          originalFilename: sanitizedName,
          status: "DUPLICATE",
          errorCode: "DUPLICATE",
          errorMessage: "Ya existe un recibo asociado para este colaborador y período",
          detectedDocument: detectedRaw,
          normalizedDocument,
          employeeId,
          uploadedByUserId: input.uploadedByUserId,
          idempotencyKey: input.idempotencyKey,
        });
        payrollReceiptMetrics.duplicate({
          operation: "upload",
          status: "DUPLICATE",
          documentMasked,
          year: batch.year,
          month: batch.month,
        });
        await auditService.log(input.companyId, {
          userId: input.uploadedByUserId,
          action: "PAYROLL_RECEIPT_DUPLICATE",
          entityType: "payroll_receipt",
          entityId: row.id,
          newData: {
            status: "DUPLICATE",
            existingReceiptId: existingAssociated.id,
            documentMasked,
          },
        });
        return toPayrollReceiptDto(row);
      }
    }

    try {
      assertPayrollReceiptPdfMetadata({
        originalFileName: sanitizedName,
        declaredContentType: input.declaredContentType,
      });
    } catch (error) {
      destroyQuietly(input.body);
      await releaseSlot();
      throw error;
    }

    const receiptId = newPayrollReceiptId();
    const bucketName = env.GCS_BUCKET_NAME!;
    const objectKey = buildPayrollReceiptObjectKey({
      storagePrefix: env.PAYROLL_RECEIPTS_STORAGE_PREFIX,
      companyId: input.companyId,
      year: batch.year,
      month: batch.month,
      receiptId,
    });

    let pending: PayrollReceipt;
    try {
      pending = await payrollReceiptRepository.createPending({
        id: receiptId,
        companyId: input.companyId,
        batchId: input.batchId,
        year: batch.year,
        month: batch.month,
        originalFilename: sanitizedName,
        status: "PENDING",
        detectedDocument: detectedRaw,
        normalizedDocument,
        employeeId,
        uploadedByUserId: input.uploadedByUserId,
        idempotencyKey: input.idempotencyKey,
        replacedReceiptId: input.replaceReceiptId ?? null,
      });
    } catch (error) {
      destroyQuietly(input.body);
      await releaseSlot();
      if (isDuplicateKeyError(error)) {
        const dup = await payrollReceiptRepository.findByIdempotencyKey(
          input.companyId,
          input.batchId,
          input.idempotencyKey,
        );
        if (dup) {
          return toPayrollReceiptDto(dup);
        }
      }
      throw error;
    }

    await payrollReceiptRepository.markStatus(input.companyId, receiptId, "UPLOADING", {
      expectedCurrentStatuses: ["PENDING"],
    });

    payrollReceiptMetrics.uploadStarted({
      operation: "upload",
      documentMasked,
      year: batch.year,
      month: batch.month,
    });

    const transform = new PayrollPdfUploadTransform(env.GCS_MAX_FILE_SIZE_BYTES);
    const onAbort = () => {
      destroyQuietly(input.body);
      destroyQuietly(transform);
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });
    input.body.on("error", onAbort);

    try {
      const storage = getAttachmentStorage();
      const stored = await storage.putObject({
        objectKey,
        body: input.body,
        transforms: [transform],
        contentType: "application/pdf",
        ifGenerationMatch: 0,
        metadata: {
          "receipt-id": receiptId,
          "company-id": input.companyId,
          "batch-id": input.batchId,
        },
      });

      let finalized: PayrollReceipt | null;
      try {
        if (input.replaceReceiptId) {
          // Atomic: associate NEW + mark OLD REPLACED + enqueue OLD key.
          // Never mark/delete old before new is ASSOCIATED in the same commit.
          finalized = await payrollReceiptRepository.finalizeReplaceInTransaction({
            companyId: input.companyId,
            newReceiptId: receiptId,
            oldReceiptId: input.replaceReceiptId,
            deletedByUserId: input.uploadedByUserId,
            employeeId,
            storageBucket: stored.bucketName || bucketName,
            storageObjectKey: objectKey,
            objectGeneration: stored.generation,
            mimeType: transform.mimeType,
            fileSize: transform.sizeBytes,
            checksumSha256: transform.checksumSha256,
            detectedDocument: detectedRaw,
            normalizedDocument,
          });
        } else {
          finalized = await payrollReceiptRepository.finalizeUpload({
            companyId: input.companyId,
            receiptId,
            status: "ASSOCIATED",
            employeeId,
            storageBucket: stored.bucketName || bucketName,
            storageObjectKey: objectKey,
            objectGeneration: stored.generation,
            mimeType: transform.mimeType,
            fileSize: transform.sizeBytes,
            checksumSha256: transform.checksumSha256,
            errorCode: null,
            errorMessage: null,
            detectedDocument: detectedRaw,
            normalizedDocument,
          });
        }
      } catch (dbError) {
        await compensateDeleteObject(objectKey);
        if (isDuplicateKeyError(dbError)) {
          const dupRow = await payrollReceiptRepository.finalizeUpload({
            companyId: input.companyId,
            receiptId,
            status: "DUPLICATE",
            employeeId,
            errorCode: "DUPLICATE",
            errorMessage: "Conflicto de unicidad al asociar el recibo",
          });
          await payrollReceiptRepository.refreshBatchStatus(input.companyId, input.batchId);
          await auditService.log(input.companyId, {
            userId: input.uploadedByUserId,
            action: "PAYROLL_RECEIPT_DUPLICATE",
            entityType: "payroll_receipt",
            entityId: receiptId,
            newData: { status: "DUPLICATE", documentMasked },
          });
          return toPayrollReceiptDto(dupRow ?? pending);
        }
        await payrollReceiptRepository.finalizeUpload({
          companyId: input.companyId,
          receiptId,
          status: "FAILED",
          errorCode: "DB_FINALIZE_FAILED",
          errorMessage: "Error al finalizar el recibo tras la carga",
        });
        await payrollReceiptRepository.refreshBatchStatus(input.companyId, input.batchId);
        throw dbError;
      }

      if (input.replaceReceiptId) {
        await auditService.log(input.companyId, {
          userId: input.uploadedByUserId,
          action: "PAYROLL_RECEIPT_REPLACED",
          entityType: "payroll_receipt",
          entityId: receiptId,
          newData: {
            replacedReceiptId: input.replaceReceiptId,
            documentMasked,
          },
        });
      }

      await payrollReceiptRepository.refreshBatchStatus(input.companyId, input.batchId);

      payrollReceiptMetrics.uploadCompleted({
        operation: "upload",
        status: "ASSOCIATED",
        documentMasked,
        year: batch.year,
        month: batch.month,
      });
      payrollReceiptMetrics.associated({
        operation: "upload",
        status: "ASSOCIATED",
        documentMasked,
      });

      await auditService.log(input.companyId, {
        userId: input.uploadedByUserId,
        action: "PAYROLL_RECEIPT_UPLOADED",
        entityType: "payroll_receipt",
        entityId: receiptId,
        newData: { status: "ASSOCIATED", documentMasked, year: batch.year, month: batch.month },
      });
      await auditService.log(input.companyId, {
        userId: input.uploadedByUserId,
        action: "PAYROLL_RECEIPT_ASSOCIATED",
        entityType: "payroll_receipt",
        entityId: receiptId,
        newData: { employeeId, documentMasked },
      });

      return toPayrollReceiptDto(finalized ?? pending);
    } catch (error) {
      destroyQuietly(input.body);
      destroyQuietly(transform);
      const code =
        error instanceof AppError ? error.code : "UPLOAD_FAILED";
      const message =
        error instanceof AppError ? error.message : "Error al subir el recibo";
      await payrollReceiptRepository.finalizeUpload({
        companyId: input.companyId,
        receiptId,
        status: code.startsWith("PAYROLL_RECEIPT_") ? "UPLOAD_FAILED" : "UPLOAD_FAILED",
        errorCode: code,
        errorMessage: message.slice(0, 1000),
      });
      await payrollReceiptRepository.refreshBatchStatus(input.companyId, input.batchId);
      payrollReceiptMetrics.uploadFailed({
        operation: "upload",
        errorCode: code,
        documentMasked,
      });
      await auditService.log(input.companyId, {
        userId: input.uploadedByUserId,
        action: "PAYROLL_RECEIPT_FAILED",
        entityType: "payroll_receipt",
        entityId: receiptId,
        newData: { status: "UPLOAD_FAILED", errorCode: code, documentMasked },
      });
      if (error instanceof AppError) {
        throw error;
      }
      const failed = await payrollReceiptRepository.findById(input.companyId, receiptId);
      return toPayrollReceiptDto(failed ?? pending);
    } finally {
      input.signal?.removeEventListener("abort", onAbort);
    }
  },

  async replaceReceipt(input: {
    companyId: string;
    receiptId: string;
    body: Readable;
    originalFileName: string;
    declaredContentType: string;
    uploadedByUserId: string;
    idempotencyKey: string;
    signal?: AbortSignal;
  }): Promise<PayrollReceiptDto> {
    const existing = await payrollReceiptRepository.findById(
      input.companyId,
      input.receiptId,
    );
    if (!existing || existing.deletedAt || existing.status !== "ASSOCIATED") {
      destroyQuietly(input.body);
      throw new AppError(
        404,
        "PAYROLL_RECEIPT_NOT_FOUND",
        "Recibo asociado no encontrado para reemplazo",
      );
    }

    return this.uploadReceipt({
      companyId: input.companyId,
      batchId: existing.batchId,
      body: input.body,
      originalFileName: input.originalFileName,
      declaredContentType: input.declaredContentType,
      uploadedByUserId: input.uploadedByUserId,
      idempotencyKey: input.idempotencyKey,
      signal: input.signal,
      replaceReceiptId: existing.id,
    });
  },

  async softDelete(input: {
    companyId: string;
    receiptId: string;
    deletedByUserId: string;
  }): Promise<PayrollReceiptDto> {
    const existing = await payrollReceiptRepository.findById(
      input.companyId,
      input.receiptId,
    );
    if (!existing || existing.deletedAt) {
      throw new AppError(404, "PAYROLL_RECEIPT_NOT_FOUND", "Recibo no encontrado");
    }

    // Soft-delete + enqueue storage key in one txn (see pending-storage-deletion.repository).
    // No standalone payroll deletion worker yet; company purge drains the queue.
    // After commit: re-enqueue (idempotent) + best-effort GCS delete for faster cleanup.
    const deleted = await payrollReceiptRepository.softDelete({
      companyId: input.companyId,
      receiptId: input.receiptId,
      deletedByUserId: input.deletedByUserId,
      status: "DELETED",
    });
    if (!deleted) {
      throw new AppError(404, "PAYROLL_RECEIPT_NOT_FOUND", "Recibo no encontrado");
    }

    if (existing.storageObjectKey) {
      await pendingStorageDeletionRepository.enqueueKeys(input.companyId, [
        existing.storageObjectKey,
      ]);
      try {
        await getAttachmentStorage().deleteObject({ objectKey: existing.storageObjectKey });
      } catch {
        payrollReceiptMetrics.deleteFailed({
          operation: "soft_delete",
          errorCode: "GCS_DELETE",
        });
      }
    }

    await payrollReceiptRepository.refreshBatchStatus(input.companyId, existing.batchId);

    await auditService.log(input.companyId, {
      userId: input.deletedByUserId,
      action: "PAYROLL_RECEIPT_DELETED",
      entityType: "payroll_receipt",
      entityId: input.receiptId,
      newData: {
        status: "DELETED",
        documentMasked: maskDocumentForLog(existing.normalizedDocument),
      },
    });

    return toPayrollReceiptDto(deleted);
  },

  /**
   * Revalidate CUIL from filename + employee match. Does NOT retry GCS upload.
   * If association would succeed but there is no stored file, asks the client to re-upload.
   */
  async reconcileAssociation(input: {
    companyId: string;
    receiptId: string;
    uploadedByUserId: string;
  }): Promise<PayrollReceiptDto> {
    const existing = await payrollReceiptRepository.findById(
      input.companyId,
      input.receiptId,
    );
    if (!existing || existing.deletedAt) {
      throw new AppError(404, "PAYROLL_RECEIPT_NOT_FOUND", "Recibo no encontrado");
    }

    const reconcilable: PayrollReceiptStatus[] = [
      "DOCUMENT_NOT_FOUND",
      "INVALID_DOCUMENT",
      "AMBIGUOUS_DOCUMENT",
      "EMPLOYEE_NOT_FOUND",
      "EMPLOYEE_DOCUMENT_AMBIGUOUS",
      "UPLOAD_FAILED",
      "FAILED",
    ];
    if (!reconcilable.includes(existing.status) || existing.storageObjectKey) {
      throw new AppError(
        400,
        "PAYROLL_RECEIPT_NOT_RECONCILABLE",
        "Solo se puede revalidar la asociación de recibos fallidos sin archivo en almacenamiento",
      );
    }

    const extraction = extractAndValidateDocumentFromFilename(existing.originalFilename);
    if (extraction.outcome !== "success") {
      const status: PayrollReceiptStatus =
        extraction.outcome === "not_found"
          ? "DOCUMENT_NOT_FOUND"
          : extraction.outcome === "ambiguous"
            ? "AMBIGUOUS_DOCUMENT"
            : "INVALID_DOCUMENT";
      const updated = await payrollReceiptRepository.finalizeUpload({
        companyId: input.companyId,
        receiptId: existing.id,
        status,
        errorCode: status,
        errorMessage:
          extraction.outcome === "invalid"
            ? extraction.reason
            : "Revalidación: documento no válido en el nombre de archivo",
      });
      await payrollReceiptRepository.refreshBatchStatus(input.companyId, existing.batchId);
      return toPayrollReceiptDto(updated ?? existing);
    }

    const employeeMatch = await resolveEmployeeForDocument(
      input.companyId,
      extraction.normalizedDocument,
    );
    if (employeeMatch.outcome !== "found") {
      const status: PayrollReceiptStatus =
        employeeMatch.outcome === "ambiguous"
          ? "EMPLOYEE_DOCUMENT_AMBIGUOUS"
          : "EMPLOYEE_NOT_FOUND";
      const updated = await payrollReceiptRepository.finalizeUpload({
        companyId: input.companyId,
        receiptId: existing.id,
        status,
        detectedDocument: extraction.detectedRaw,
        normalizedDocument: extraction.normalizedDocument,
        errorCode: status,
        errorMessage:
          status === "EMPLOYEE_NOT_FOUND"
            ? "No hay colaborador con ese documento"
            : "Documento ambiguo entre colaboradores",
      });
      await payrollReceiptRepository.refreshBatchStatus(input.companyId, existing.batchId);
      return toPayrollReceiptDto(updated ?? existing);
    }

    const dup = await payrollReceiptRepository.findActiveAssociated(
      input.companyId,
      employeeMatch.employeeId,
      existing.year,
      existing.month,
    );
    if (dup && dup.id !== existing.id) {
      const updated = await payrollReceiptRepository.finalizeUpload({
        companyId: input.companyId,
        receiptId: existing.id,
        status: "DUPLICATE",
        employeeId: employeeMatch.employeeId,
        detectedDocument: extraction.detectedRaw,
        normalizedDocument: extraction.normalizedDocument,
        errorCode: "DUPLICATE",
        errorMessage: "Ya existe un recibo asociado para este período",
      });
      await payrollReceiptRepository.refreshBatchStatus(input.companyId, existing.batchId);
      return toPayrollReceiptDto(updated ?? existing);
    }

    throw new AppError(
      400,
      "PAYROLL_RECEIPT_RECONCILE_NEEDS_REUPLOAD",
      "La asociación es válida, pero no hay archivo almacenado. Vuelva a subir el PDF al lote",
    );
  },

  async openDownloadStream(input: {
    companyId: string;
    receiptId: string;
    disposition: "inline" | "attachment";
    downloadedByUserId: string;
  }): Promise<{
    stream: Readable;
    contentType: string;
    contentLength: number;
    fileName: string;
    disposition: string;
  }> {
    const receipt = await payrollReceiptRepository.findById(
      input.companyId,
      input.receiptId,
    );
    if (
      !receipt ||
      receipt.deletedAt ||
      receipt.status !== "ASSOCIATED" ||
      !receipt.storageObjectKey
    ) {
      throw new AppError(404, "PAYROLL_RECEIPT_NOT_FOUND", "Recibo no disponible para descarga");
    }

    payrollReceiptMetrics.downloadStarted({ operation: "download" });

    const storage = getAttachmentStorage();
    const meta = await storage.getObjectMetadata({
      objectKey: receipt.storageObjectKey,
      generation: receipt.objectGeneration ?? undefined,
    });
    const stream = await storage.getObjectStream({
      objectKey: receipt.storageObjectKey,
      generation: receipt.objectGeneration ?? undefined,
    });

    await auditService.log(input.companyId, {
      userId: input.downloadedByUserId,
      action: "PAYROLL_RECEIPT_DOWNLOADED",
      entityType: "payroll_receipt",
      entityId: receipt.id,
      newData: {
        disposition: input.disposition,
        documentMasked: maskDocumentForLog(receipt.normalizedDocument),
      },
    });

    return {
      stream,
      contentType: receipt.mimeType || meta.contentType || "application/pdf",
      contentLength: receipt.fileSize ?? meta.sizeBytes,
      fileName: receipt.originalFilename,
      disposition: buildContentDisposition(input.disposition, receipt.originalFilename),
    };
  },
};

/**
 * No secure employee↔user link exists for "view own" receipts.
 * Do NOT expose a view_own endpoint without a verified identity binding.
 */
// export const payrollReceiptOwnService = { /* intentionally unimplemented */ };
