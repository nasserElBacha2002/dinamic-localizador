import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import {
  PAYROLL_RECEIPT_STORAGE_PROVIDER,
  type PayrollReceipt,
  type PayrollReceiptBatch,
  type PayrollReceiptBatchStatus,
  type PayrollReceiptStatus,
} from "../types/payroll-receipt";
import { getPagination } from "../utils/pagination";
import type {
  ListPayrollReceiptBatchesQuery,
  ListPayrollReceiptsQuery,
} from "../schemas/payroll-receipt.schema";
import { normalizeEmployeeDocument } from "../utils/payroll-receipts/extract-document-from-filename";
import { createUuidInFilter } from "../utils/sql-uuid-in-filter";
import { pendingStorageDeletionRepository } from "./pending-storage-deletion.repository";

const toIso = (value: Date | string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

export const mapPayrollReceiptBatchRow = (
  row: Record<string, unknown>,
): PayrollReceiptBatch => ({
  id: String(row.id),
  companyId: String(row.company_id),
  year: Number(row.year),
  month: Number(row.month),
  status: String(row.status) as PayrollReceiptBatchStatus,
  totalFiles: Number(row.total_files ?? 0),
  processedFiles: Number(row.processed_files ?? 0),
  associatedFiles: Number(row.associated_files ?? 0),
  failedFiles: Number(row.failed_files ?? 0),
  createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
  createdAt: toIso(row.created_at as Date | string)!,
  updatedAt: toIso(row.updated_at as Date | string)!,
});

export const mapPayrollReceiptRow = (row: Record<string, unknown>): PayrollReceipt => ({
  id: String(row.id),
  companyId: String(row.company_id),
  batchId: String(row.batch_id),
  employeeId: row.employee_id ? String(row.employee_id) : null,
  year: Number(row.year),
  month: Number(row.month),
  originalFilename: String(row.original_filename),
  storageProvider: PAYROLL_RECEIPT_STORAGE_PROVIDER,
  storageBucket: row.storage_bucket ? String(row.storage_bucket) : null,
  storageObjectKey: row.storage_object_key ? String(row.storage_object_key) : null,
  objectGeneration: row.object_generation == null ? null : String(row.object_generation),
  detectedDocument: row.detected_document ? String(row.detected_document) : null,
  normalizedDocument: row.normalized_document ? String(row.normalized_document) : null,
  status: String(row.status) as PayrollReceiptStatus,
  errorCode: row.error_code ? String(row.error_code) : null,
  errorMessage: row.error_message ? String(row.error_message) : null,
  mimeType: row.mime_type ? String(row.mime_type) : null,
  fileSize: row.file_size == null ? null : Number(row.file_size),
  checksumSha256: row.checksum_sha256 ? String(row.checksum_sha256) : null,
  idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
  uploadedByUserId: row.uploaded_by_user_id ? String(row.uploaded_by_user_id) : null,
  replacedReceiptId: row.replaced_receipt_id ? String(row.replaced_receipt_id) : null,
  createdAt: toIso(row.created_at as Date | string)!,
  updatedAt: toIso(row.updated_at as Date | string)!,
  deletedAt: toIso(row.deleted_at as Date | string | null),
  deletedByUserId: row.deleted_by_user_id ? String(row.deleted_by_user_id) : null,
  employeeName: row.employee_name != null ? String(row.employee_name) : null,
});

export type CreatePayrollReceiptPendingInput = {
  id: string;
  companyId: string;
  batchId: string;
  year: number;
  month: number;
  originalFilename: string;
  status: PayrollReceiptStatus;
  detectedDocument?: string | null;
  normalizedDocument?: string | null;
  employeeId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  idempotencyKey?: string | null;
  uploadedByUserId?: string | null;
  replacedReceiptId?: string | null;
};

export type FinalizePayrollReceiptUploadInput = {
  companyId: string;
  receiptId: string;
  status: PayrollReceiptStatus;
  employeeId?: string | null;
  storageBucket?: string | null;
  storageObjectKey?: string | null;
  objectGeneration?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  checksumSha256?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  detectedDocument?: string | null;
  normalizedDocument?: string | null;
};

export type FinalizeReplacePayrollReceiptInput = {
  companyId: string;
  newReceiptId: string;
  oldReceiptId: string;
  deletedByUserId: string | null;
  employeeId: string;
  storageBucket: string;
  storageObjectKey: string;
  objectGeneration: string;
  mimeType: string;
  fileSize: number;
  checksumSha256: string;
  detectedDocument: string | null;
  normalizedDocument: string | null;
};

const FAILURE_STATUSES: PayrollReceiptStatus[] = [
  "DOCUMENT_NOT_FOUND",
  "INVALID_DOCUMENT",
  "AMBIGUOUS_DOCUMENT",
  "EMPLOYEE_NOT_FOUND",
  "EMPLOYEE_DOCUMENT_AMBIGUOUS",
  "DUPLICATE",
  "UPLOAD_FAILED",
  "FAILED",
];

export const payrollReceiptRepository = {
  async createBatch(input: {
    id: string;
    companyId: string;
    year: number;
    month: number;
    status?: PayrollReceiptBatchStatus;
    createdByUserId?: string | null;
  }): Promise<PayrollReceiptBatch> {
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, input.id)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("year", sql.Int, input.year)
      .input("month", sql.Int, input.month)
      .input("status", sql.NVarChar(40), input.status ?? "PROCESSING")
      .input("createdByUserId", sql.UniqueIdentifier, input.createdByUserId ?? null)
      .query(`
        INSERT INTO payroll_receipt_batches (
          id, company_id, year, month, status, created_by_user_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @id, @companyId, @year, @month, @status, @createdByUserId
        )
      `);
    return mapPayrollReceiptBatchRow(result.recordset[0] as Record<string, unknown>);
  },

  async findBatchById(
    companyId: string,
    batchId: string,
  ): Promise<PayrollReceiptBatch | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        SELECT *
        FROM payroll_receipt_batches
        WHERE id = @batchId AND company_id = @companyId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapPayrollReceiptBatchRow(result.recordset[0] as Record<string, unknown>);
  },

  async listBatches(
    companyId: string,
    query: ListPayrollReceiptBatchesQuery,
  ): Promise<{ items: PayrollReceiptBatch[]; total: number }> {
    const { page, limit, offset } = getPagination(query.page, query.limit);
    const request = getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("offset", sql.Int, offset);
    request.input("limit", sql.Int, limit);

    const filters: string[] = ["company_id = @companyId"];
    if (query.year != null) {
      request.input("year", sql.Int, query.year);
      filters.push("year = @year");
    }
    if (query.month != null) {
      request.input("month", sql.Int, query.month);
      filters.push("month = @month");
    }
    const where = filters.join(" AND ");

    const countResult = await request.query(`
      SELECT COUNT(1) AS total FROM payroll_receipt_batches WHERE ${where}
    `);
    const total = Number(countResult.recordset[0]?.total ?? 0);

    const listRequest = getPool().request();
    listRequest.input("companyId", sql.UniqueIdentifier, companyId);
    listRequest.input("offset", sql.Int, offset);
    listRequest.input("limit", sql.Int, limit);
    if (query.year != null) {
      listRequest.input("year", sql.Int, query.year);
    }
    if (query.month != null) {
      listRequest.input("month", sql.Int, query.month);
    }

    const listResult = await listRequest.query(`
      SELECT *
      FROM payroll_receipt_batches
      WHERE ${where}
      ORDER BY created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: listResult.recordset.map((row) =>
        mapPayrollReceiptBatchRow(row as Record<string, unknown>),
      ),
      total,
    };
  },

  async listReceiptsByBatch(
    companyId: string,
    batchId: string,
  ): Promise<PayrollReceipt[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        SELECT r.*, e.name AS employee_name
        FROM payroll_receipts r
        LEFT JOIN employees e ON e.id = r.employee_id AND e.company_id = r.company_id
        WHERE r.company_id = @companyId AND r.batch_id = @batchId
        ORDER BY r.created_at ASC
      `);
    return result.recordset.map((row) => mapPayrollReceiptRow(row as Record<string, unknown>));
  },

  async createPending(input: CreatePayrollReceiptPendingInput): Promise<PayrollReceipt> {
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, input.id)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("batchId", sql.UniqueIdentifier, input.batchId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId ?? null)
      .input("year", sql.Int, input.year)
      .input("month", sql.Int, input.month)
      .input("originalFilename", sql.NVarChar(255), input.originalFilename)
      .input("status", sql.NVarChar(40), input.status)
      .input("detectedDocument", sql.NVarChar(20), input.detectedDocument ?? null)
      .input("normalizedDocument", sql.NVarChar(20), input.normalizedDocument ?? null)
      .input("errorCode", sql.NVarChar(80), input.errorCode ?? null)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage ?? null)
      .input("idempotencyKey", sql.NVarChar(128), input.idempotencyKey ?? null)
      .input("uploadedByUserId", sql.UniqueIdentifier, input.uploadedByUserId ?? null)
      .input("replacedReceiptId", sql.UniqueIdentifier, input.replacedReceiptId ?? null)
      .query(`
        INSERT INTO payroll_receipts (
          id, company_id, batch_id, employee_id, year, month,
          original_filename, status, detected_document, normalized_document,
          error_code, error_message, idempotency_key, uploaded_by_user_id,
          replaced_receipt_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @id, @companyId, @batchId, @employeeId, @year, @month,
          @originalFilename, @status, @detectedDocument, @normalizedDocument,
          @errorCode, @errorMessage, @idempotencyKey, @uploadedByUserId,
          @replacedReceiptId
        )
      `);
    return mapPayrollReceiptRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(companyId: string, receiptId: string): Promise<PayrollReceipt | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .query(`
        SELECT r.*, e.name AS employee_name
        FROM payroll_receipts r
        LEFT JOIN employees e ON e.id = r.employee_id AND e.company_id = r.company_id
        WHERE r.id = @receiptId AND r.company_id = @companyId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapPayrollReceiptRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByIdempotencyKey(
    companyId: string,
    batchId: string,
    idempotencyKey: string,
  ): Promise<PayrollReceipt | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("idempotencyKey", sql.NVarChar(128), idempotencyKey)
      .query(`
        SELECT TOP 1 r.*, e.name AS employee_name
        FROM payroll_receipts r
        LEFT JOIN employees e ON e.id = r.employee_id AND e.company_id = r.company_id
        WHERE r.company_id = @companyId
          AND r.batch_id = @batchId
          AND r.idempotency_key = @idempotencyKey
        ORDER BY r.created_at DESC
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapPayrollReceiptRow(result.recordset[0] as Record<string, unknown>);
  },

  async findActiveAssociated(
    companyId: string,
    employeeId: string,
    year: number,
    month: number,
  ): Promise<PayrollReceipt | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("year", sql.Int, year)
      .input("month", sql.Int, month)
      .query(`
        SELECT TOP 1 r.*, e.name AS employee_name
        FROM payroll_receipts r
        LEFT JOIN employees e ON e.id = r.employee_id AND e.company_id = r.company_id
        WHERE r.company_id = @companyId
          AND r.employee_id = @employeeId
          AND r.year = @year
          AND r.month = @month
          AND r.status = N'ASSOCIATED'
          AND r.deleted_at IS NULL
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapPayrollReceiptRow(result.recordset[0] as Record<string, unknown>);
  },

  async markStatus(
    companyId: string,
    receiptId: string,
    status: PayrollReceiptStatus,
    options?: {
      expectedCurrentStatuses?: PayrollReceiptStatus[];
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<PayrollReceipt | null> {
    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("receiptId", sql.UniqueIdentifier, receiptId)
      .input("status", sql.NVarChar(40), status)
      .input("errorCode", sql.NVarChar(80), options?.errorCode ?? null)
      .input("errorMessage", sql.NVarChar(1000), options?.errorMessage ?? null);

    let expectedClause = "";
    if (options?.expectedCurrentStatuses?.length) {
      const placeholders = options.expectedCurrentStatuses.map((s, i) => {
        request.input(`exp${i}`, sql.NVarChar(40), s);
        return `@exp${i}`;
      });
      expectedClause = ` AND status IN (${placeholders.join(", ")})`;
    }

    const result = await request.query(`
      UPDATE payroll_receipts
      SET status = @status,
          error_code = COALESCE(@errorCode, error_code),
          error_message = COALESCE(@errorMessage, error_message),
          updated_at = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE id = @receiptId AND company_id = @companyId${expectedClause}
    `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapPayrollReceiptRow(result.recordset[0] as Record<string, unknown>);
  },

  async finalizeUpload(input: FinalizePayrollReceiptUploadInput): Promise<PayrollReceipt | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("receiptId", sql.UniqueIdentifier, input.receiptId)
      .input("status", sql.NVarChar(40), input.status)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId ?? null)
      .input("storageBucket", sql.NVarChar(200), input.storageBucket ?? null)
      .input("storageObjectKey", sql.NVarChar(500), input.storageObjectKey ?? null)
      .input(
        "objectGeneration",
        sql.BigInt,
        input.objectGeneration != null ? Number(input.objectGeneration) : null,
      )
      .input("mimeType", sql.NVarChar(120), input.mimeType ?? null)
      .input("fileSize", sql.BigInt, input.fileSize ?? null)
      .input("checksumSha256", sql.Char(64), input.checksumSha256 ?? null)
      .input("errorCode", sql.NVarChar(80), input.errorCode ?? null)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage ?? null)
      .input("detectedDocument", sql.NVarChar(20), input.detectedDocument ?? null)
      .input("normalizedDocument", sql.NVarChar(20), input.normalizedDocument ?? null)
      .query(`
        UPDATE payroll_receipts
        SET status = @status,
            employee_id = COALESCE(@employeeId, employee_id),
            storage_bucket = COALESCE(@storageBucket, storage_bucket),
            storage_object_key = COALESCE(@storageObjectKey, storage_object_key),
            object_generation = COALESCE(@objectGeneration, object_generation),
            mime_type = COALESCE(@mimeType, mime_type),
            file_size = COALESCE(@fileSize, file_size),
            checksum_sha256 = COALESCE(@checksumSha256, checksum_sha256),
            error_code = @errorCode,
            error_message = @errorMessage,
            detected_document = COALESCE(@detectedDocument, detected_document),
            normalized_document = COALESCE(@normalizedDocument, normalized_document),
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @receiptId AND company_id = @companyId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapPayrollReceiptRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Soft-delete receipt and enqueue storage key in the same transaction.
   * GCS delete must happen after commit (best-effort) or via pending queue worker.
   */
  async softDelete(input: {
    companyId: string;
    receiptId: string;
    deletedByUserId: string | null;
    status?: PayrollReceiptStatus;
  }): Promise<PayrollReceipt | null> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("receiptId", sql.UniqueIdentifier, input.receiptId)
        .input("deletedByUserId", sql.UniqueIdentifier, input.deletedByUserId)
        .input("status", sql.NVarChar(40), input.status ?? "DELETED")
        .query(`
          UPDATE payroll_receipts
          SET status = @status,
              deleted_at = SYSUTCDATETIME(),
              deleted_by_user_id = @deletedByUserId,
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE id = @receiptId
            AND company_id = @companyId
            AND deleted_at IS NULL
        `);
      if (!result.recordset[0]) {
        await transaction.rollback();
        return null;
      }
      const deleted = mapPayrollReceiptRow(result.recordset[0] as Record<string, unknown>);
      if (deleted.storageObjectKey) {
        await pendingStorageDeletionRepository.enqueueKeys(
          input.companyId,
          [deleted.storageObjectKey],
          transaction,
        );
      }
      await transaction.commit();
      return deleted;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  /**
   * After GCS upload of the NEW object: associate new + soft-replace old + enqueue
   * old object key in ONE transaction. Caller compensates NEW GCS object on failure.
   */
  async finalizeReplaceInTransaction(
    input: FinalizeReplacePayrollReceiptInput,
  ): Promise<PayrollReceipt> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const oldLock = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("oldReceiptId", sql.UniqueIdentifier, input.oldReceiptId)
        .query(`
          SELECT *
          FROM payroll_receipts WITH (UPDLOCK, HOLDLOCK)
          WHERE id = @oldReceiptId
            AND company_id = @companyId
            AND status = N'ASSOCIATED'
            AND deleted_at IS NULL
        `);
      const oldRow = oldLock.recordset[0] as Record<string, unknown> | undefined;
      if (!oldRow) {
        throw new AppError(
          409,
          "PAYROLL_RECEIPT_REPLACE_CONFLICT",
          "El recibo a reemplazar ya no está asociado o no existe",
        );
      }
      const oldReceipt = mapPayrollReceiptRow(oldRow);

      const newResult = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("receiptId", sql.UniqueIdentifier, input.newReceiptId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("storageBucket", sql.NVarChar(200), input.storageBucket)
        .input("storageObjectKey", sql.NVarChar(500), input.storageObjectKey)
        .input("objectGeneration", sql.BigInt, Number(input.objectGeneration))
        .input("mimeType", sql.NVarChar(120), input.mimeType)
        .input("fileSize", sql.BigInt, input.fileSize)
        .input("checksumSha256", sql.Char(64), input.checksumSha256)
        .input("detectedDocument", sql.NVarChar(20), input.detectedDocument)
        .input("normalizedDocument", sql.NVarChar(20), input.normalizedDocument)
        .query(`
          UPDATE payroll_receipts
          SET status = N'ASSOCIATED',
              employee_id = @employeeId,
              storage_bucket = @storageBucket,
              storage_object_key = @storageObjectKey,
              object_generation = @objectGeneration,
              mime_type = @mimeType,
              file_size = @fileSize,
              checksum_sha256 = @checksumSha256,
              error_code = NULL,
              error_message = NULL,
              detected_document = COALESCE(@detectedDocument, detected_document),
              normalized_document = COALESCE(@normalizedDocument, normalized_document),
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE id = @receiptId AND company_id = @companyId
        `);
      if (!newResult.recordset[0]) {
        throw new AppError(404, "PAYROLL_RECEIPT_NOT_FOUND", "Recibo nuevo no encontrado");
      }

      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("oldReceiptId", sql.UniqueIdentifier, input.oldReceiptId)
        .input("deletedByUserId", sql.UniqueIdentifier, input.deletedByUserId)
        .query(`
          UPDATE payroll_receipts
          SET status = N'REPLACED',
              deleted_at = SYSUTCDATETIME(),
              deleted_by_user_id = @deletedByUserId,
              updated_at = SYSUTCDATETIME()
          WHERE id = @oldReceiptId
            AND company_id = @companyId
            AND status = N'ASSOCIATED'
            AND deleted_at IS NULL
        `);

      if (oldReceipt.storageObjectKey) {
        await pendingStorageDeletionRepository.enqueueKeys(
          input.companyId,
          [oldReceipt.storageObjectKey],
          transaction,
        );
      }

      await transaction.commit();
      return mapPayrollReceiptRow(newResult.recordset[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  async tryReserveBatchSlot(input: {
    companyId: string;
    batchId: string;
    maxFiles: number;
  }): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("batchId", sql.UniqueIdentifier, input.batchId)
      .input("maxFiles", sql.Int, input.maxFiles)
      .query(`
        UPDATE payroll_receipt_batches WITH (UPDLOCK, ROWLOCK)
        SET total_files = total_files + 1,
            updated_at = SYSUTCDATETIME()
        WHERE id = @batchId
          AND company_id = @companyId
          AND total_files < @maxFiles
      `);
    return Number(result.rowsAffected[0] ?? 0) > 0;
  },

  async releaseBatchSlot(companyId: string, batchId: string): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        UPDATE payroll_receipt_batches WITH (UPDLOCK, ROWLOCK)
        SET total_files = CASE WHEN total_files > 0 THEN total_files - 1 ELSE 0 END,
            updated_at = SYSUTCDATETIME()
        WHERE id = @batchId AND company_id = @companyId
      `);
  },

  async list(
    companyId: string,
    query: ListPayrollReceiptsQuery,
  ): Promise<{ items: PayrollReceipt[]; total: number }> {
    const { page, limit, offset } = getPagination(query.page, query.limit);
    const filters: string[] = ["r.company_id = @companyId", "r.deleted_at IS NULL"];
    const employeeIdsFilter = createUuidInFilter({
      column: "r.employee_id",
      parameterPrefix: "employeeId",
      values: query.employeeIds,
    });

    const bind = (request: sql.Request) => {
      request.input("companyId", sql.UniqueIdentifier, companyId);
      if (query.year != null) {
        request.input("year", sql.Int, query.year);
      }
      if (query.month != null) {
        request.input("month", sql.Int, query.month);
      }
      employeeIdsFilter?.apply(request);
      if (query.status) {
        request.input("status", sql.NVarChar(40), query.status);
      }
      if (query.search) {
        request.input("search", sql.NVarChar(150), `%${query.search}%`);
      }
      if (query.document) {
        const normalized = normalizeEmployeeDocument(query.document) ?? query.document.replace(/\D/g, "");
        request.input("document", sql.NVarChar(20), normalized);
      }
      if (query.batchId) {
        request.input("batchId", sql.UniqueIdentifier, query.batchId);
      }
    };

    if (query.year != null) filters.push("r.year = @year");
    if (query.month != null) filters.push("r.month = @month");
    if (employeeIdsFilter) filters.push(employeeIdsFilter.clause);
    if (query.status) filters.push("r.status = @status");
    if (query.search) filters.push("e.name LIKE @search");
    if (query.document) {
      filters.push("r.normalized_document = @document");
    }
    if (query.batchId) filters.push("r.batch_id = @batchId");

    const where = filters.join(" AND ");

    const countRequest = getPool().request();
    bind(countRequest);
    const countResult = await countRequest.query(`
      SELECT COUNT(1) AS total
      FROM payroll_receipts r
      LEFT JOIN employees e ON e.id = r.employee_id AND e.company_id = r.company_id
      WHERE ${where}
    `);
    const total = Number(countResult.recordset[0]?.total ?? 0);

    const listRequest = getPool().request();
    bind(listRequest);
    listRequest.input("offset", sql.Int, offset);
    listRequest.input("limit", sql.Int, limit);
    const listResult = await listRequest.query(`
      SELECT r.*, e.name AS employee_name
      FROM payroll_receipts r
      LEFT JOIN employees e ON e.id = r.employee_id AND e.company_id = r.company_id
      WHERE ${where}
      ORDER BY r.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: listResult.recordset.map((row) =>
        mapPayrollReceiptRow(row as Record<string, unknown>),
      ),
      total,
    };
  },

  async bumpBatchCounters(
    companyId: string,
    batchId: string,
    delta: {
      totalFiles?: number;
      processedFiles?: number;
      associatedFiles?: number;
      failedFiles?: number;
    },
  ): Promise<PayrollReceiptBatch> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("totalFiles", sql.Int, delta.totalFiles ?? 0)
      .input("processedFiles", sql.Int, delta.processedFiles ?? 0)
      .input("associatedFiles", sql.Int, delta.associatedFiles ?? 0)
      .input("failedFiles", sql.Int, delta.failedFiles ?? 0)
      .query(`
        UPDATE payroll_receipt_batches
        SET total_files = total_files + @totalFiles,
            processed_files = processed_files + @processedFiles,
            associated_files = associated_files + @associatedFiles,
            failed_files = failed_files + @failedFiles,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @batchId AND company_id = @companyId
      `);
    return mapPayrollReceiptBatchRow(result.recordset[0] as Record<string, unknown>);
  },

  async refreshBatchStatus(companyId: string, batchId: string): Promise<PayrollReceiptBatch> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        DECLARE @associated INT = (
          SELECT COUNT(1) FROM payroll_receipts
          WHERE company_id = @companyId AND batch_id = @batchId AND status = N'ASSOCIATED'
        );
        DECLARE @failed INT = (
          SELECT COUNT(1) FROM payroll_receipts
          WHERE company_id = @companyId AND batch_id = @batchId
            AND status IN (${FAILURE_STATUSES.map((s) => `N'${s}'`).join(", ")})
        );
        DECLARE @processed INT = (
          SELECT COUNT(1) FROM payroll_receipts
          WHERE company_id = @companyId AND batch_id = @batchId
            AND status NOT IN (N'PENDING', N'UPLOADING')
        );
        DECLARE @total INT = (
          SELECT COUNT(1) FROM payroll_receipts
          WHERE company_id = @companyId AND batch_id = @batchId
        );

        UPDATE payroll_receipt_batches
        SET associated_files = @associated,
            failed_files = @failed,
            processed_files = @processed,
            total_files = @total,
            status = CASE
              WHEN @total = 0 THEN N'PROCESSING'
              WHEN @processed < @total THEN N'PROCESSING'
              WHEN @associated = 0 AND @processed > 0 AND @failed > 0 THEN N'FAILED'
              WHEN @associated = 0 AND @processed > 0 THEN N'COMPLETED_WITH_ERRORS'
              WHEN @failed > 0 AND @associated > 0 THEN N'COMPLETED_WITH_ERRORS'
              ELSE N'COMPLETED'
            END,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @batchId AND company_id = @companyId
      `);
    return mapPayrollReceiptBatchRow(result.recordset[0] as Record<string, unknown>);
  },
};
