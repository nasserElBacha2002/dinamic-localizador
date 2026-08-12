import sql from "mssql";
import { getPool } from "../database/connection";
import { assertAttachmentStatusTransition } from "../domain/absence-attachment-status";
import { AppError } from "../errors/app-error";
import type {
  AbsenceAttachmentScanStatus,
  AbsenceAttachmentSource,
  AbsenceAttachmentStatus,
  AbsenceRequestAttachment,
} from "../types/absence-attachment";
import {
  ABSENCE_ATTACHMENT_STATUSES,
  ABSENCE_ATTACHMENT_STORAGE_PROVIDER,
} from "../types/absence-attachment";
import { absenceRequestDraftRepository } from "./absence-request-draft.repository";

/** Placeholder until streaming upload finalizes real SHA-256. */
export const ATTACHMENT_CHECKSUM_PENDING = "0".repeat(64);

const ACTIVE_STATUSES_SQL = `N'PENDING_UPLOAD', N'UPLOADING', N'AVAILABLE', N'QUARANTINED'`;

const toIso = (value: Date | string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

export const mapAbsenceAttachmentRow = (
  row: Record<string, unknown>,
): AbsenceRequestAttachment => ({
  id: String(row.id),
  companyId: String(row.company_id),
  absenceRequestId: row.absence_request_id ? String(row.absence_request_id) : null,
  draftId: row.draft_id ? String(row.draft_id) : null,
  storageProvider: ABSENCE_ATTACHMENT_STORAGE_PROVIDER,
  bucketName: String(row.bucket_name),
  objectKey: String(row.object_key),
  objectGeneration: row.object_generation == null ? null : String(row.object_generation),
  originalFileName: String(row.original_file_name),
  normalizedFileName: String(row.normalized_file_name),
  declaredContentType: String(row.declared_content_type),
  detectedContentType: String(row.detected_content_type),
  sizeBytes: Number(row.size_bytes),
  checksumSha256: String(row.checksum_sha256),
  status: String(row.status) as AbsenceAttachmentStatus,
  scanStatus: String(row.scan_status) as AbsenceAttachmentScanStatus,
  uploadedByUserId: row.uploaded_by_user_id ? String(row.uploaded_by_user_id) : null,
  uploadedByEmployeeId: row.uploaded_by_employee_id
    ? String(row.uploaded_by_employee_id)
    : null,
  source: String(row.source) as AbsenceAttachmentSource,
  twilioMessageSid: row.twilio_message_sid ? String(row.twilio_message_sid) : null,
  twilioMediaIndex:
    row.twilio_media_index == null ? null : Number(row.twilio_media_index),
  idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
  attemptCount: Number(row.attempt_count ?? 0),
  lastError: row.last_error ? String(row.last_error) : null,
  createdAt: toIso(row.created_at as Date | string)!,
  updatedAt: toIso(row.updated_at as Date | string)!,
  availableAt: toIso(row.available_at as Date | string | null),
  deletedAt: toIso(row.deleted_at as Date | string | null),
  deletedByUserId: row.deleted_by_user_id ? String(row.deleted_by_user_id) : null,
  deletionReason: row.deletion_reason ? String(row.deletion_reason) : null,
});

export type CreateAttachmentMetadataInput = {
  id: string;
  companyId: string;
  absenceRequestId?: string | null;
  draftId?: string | null;
  bucketName: string;
  objectKey: string;
  originalFileName: string;
  normalizedFileName: string;
  declaredContentType: string;
  detectedContentType: string;
  sizeBytes: number;
  checksumSha256: string;
  status: AbsenceAttachmentStatus;
  scanStatus?: AbsenceAttachmentScanStatus;
  uploadedByUserId?: string | null;
  uploadedByEmployeeId?: string | null;
  source: AbsenceAttachmentSource;
  twilioMessageSid?: string | null;
  twilioMediaIndex?: number | null;
  idempotencyKey?: string | null;
};

export const absenceAttachmentRepository = {
  async create(
    input: CreateAttachmentMetadataInput,
    transaction?: sql.Transaction,
  ): Promise<AbsenceRequestAttachment> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("id", sql.UniqueIdentifier, input.id)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId ?? null)
      .input("draftId", sql.UniqueIdentifier, input.draftId ?? null)
      .input("bucketName", sql.NVarChar(200), input.bucketName)
      .input("objectKey", sql.NVarChar(500), input.objectKey)
      .input("originalFileName", sql.NVarChar(255), input.originalFileName)
      .input("normalizedFileName", sql.NVarChar(255), input.normalizedFileName)
      .input("declaredContentType", sql.NVarChar(120), input.declaredContentType)
      .input("detectedContentType", sql.NVarChar(120), input.detectedContentType)
      .input("sizeBytes", sql.BigInt, input.sizeBytes)
      .input("checksumSha256", sql.Char(64), input.checksumSha256)
      .input("status", sql.NVarChar(30), input.status)
      .input("scanStatus", sql.NVarChar(30), input.scanStatus ?? "UNSCANNED")
      .input("uploadedByUserId", sql.UniqueIdentifier, input.uploadedByUserId ?? null)
      .input(
        "uploadedByEmployeeId",
        sql.UniqueIdentifier,
        input.uploadedByEmployeeId ?? null,
      )
      .input("source", sql.NVarChar(30), input.source)
      .input("twilioMessageSid", sql.NVarChar(100), input.twilioMessageSid ?? null)
      .input("twilioMediaIndex", sql.Int, input.twilioMediaIndex ?? null)
      .input("idempotencyKey", sql.NVarChar(120), input.idempotencyKey ?? null)
      .query(`
        INSERT INTO absence_request_attachments (
          id, company_id, absence_request_id, draft_id, storage_provider, bucket_name, object_key,
          original_file_name, normalized_file_name, declared_content_type, detected_content_type,
          size_bytes, checksum_sha256, status, scan_status,
          uploaded_by_user_id, uploaded_by_employee_id, source,
          twilio_message_sid, twilio_media_index, idempotency_key
        )
        OUTPUT INSERTED.*
        VALUES (
          @id, @companyId, @absenceRequestId, @draftId, N'GOOGLE_CLOUD_STORAGE', @bucketName, @objectKey,
          @originalFileName, @normalizedFileName, @declaredContentType, @detectedContentType,
          @sizeBytes, @checksumSha256, @status, @scanStatus,
          @uploadedByUserId, @uploadedByEmployeeId, @source,
          @twilioMessageSid, @twilioMediaIndex, @idempotencyKey
        )
      `);
    return mapAbsenceAttachmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(
    companyId: string,
    absenceRequestId: string,
    attachmentId: string,
  ): Promise<AbsenceRequestAttachment | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .input("id", sql.UniqueIdentifier, attachmentId)
      .query(`
        SELECT TOP 1 *
        FROM absence_request_attachments
        WHERE id = @id
          AND company_id = @companyId
          AND absence_request_id = @absenceRequestId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapAbsenceAttachmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByTwilioMedia(
    companyId: string,
    messageSid: string,
    mediaIndex: number,
  ): Promise<AbsenceRequestAttachment | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("messageSid", sql.NVarChar(100), messageSid)
      .input("mediaIndex", sql.Int, mediaIndex)
      .query(`
        SELECT TOP 1 *
        FROM absence_request_attachments
        WHERE company_id = @companyId
          AND twilio_message_sid = @messageSid
          AND twilio_media_index = @mediaIndex
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapAbsenceAttachmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByRequest(
    companyId: string,
    absenceRequestId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<AbsenceRequestAttachment[]> {
    const pool = getPool();
    const includeDeleted = options?.includeDeleted === true;
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        SELECT *
        FROM absence_request_attachments
        WHERE company_id = @companyId
          AND absence_request_id = @absenceRequestId
          ${includeDeleted ? "" : "AND status <> N'DELETED'"}
        ORDER BY created_at ASC
      `);
    return result.recordset.map((row) =>
      mapAbsenceAttachmentRow(row as Record<string, unknown>),
    );
  },

  async listByDraft(
    companyId: string,
    draftId: string,
  ): Promise<AbsenceRequestAttachment[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("draftId", sql.UniqueIdentifier, draftId)
      .query(`
        SELECT *
        FROM absence_request_attachments
        WHERE company_id = @companyId
          AND draft_id = @draftId
          AND status <> N'DELETED'
        ORDER BY created_at ASC
      `);
    return result.recordset.map((row) =>
      mapAbsenceAttachmentRow(row as Record<string, unknown>),
    );
  },

  async countAvailable(
    companyId: string,
    absenceRequestId: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const lockHint = transaction ? "WITH (UPDLOCK, HOLDLOCK)" : "";
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        SELECT COUNT(1) AS cnt
        FROM absence_request_attachments ${lockHint}
        WHERE company_id = @companyId
          AND absence_request_id = @absenceRequestId
          AND status = N'AVAILABLE'
      `);
    return Number(result.recordset[0]?.cnt ?? 0);
  },

  async countAvailableByDraft(companyId: string, draftId: string): Promise<number> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("draftId", sql.UniqueIdentifier, draftId)
      .query(`
        SELECT COUNT(1) AS cnt
        FROM absence_request_attachments
        WHERE company_id = @companyId
          AND draft_id = @draftId
          AND status = N'AVAILABLE'
      `);
    return Number(result.recordset[0]?.cnt ?? 0);
  },

  async markAvailable(
    companyId: string,
    attachmentId: string,
    input: {
      objectGeneration: string;
      sizeBytes: number;
      checksumSha256: string;
      detectedContentType: string;
      normalizedFileName: string;
      originalFileName?: string;
    },
  ): Promise<AbsenceRequestAttachment | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, attachmentId)
      .input("generation", sql.BigInt, input.objectGeneration)
      .input("sizeBytes", sql.BigInt, input.sizeBytes)
      .input("checksumSha256", sql.Char(64), input.checksumSha256)
      .input("detectedContentType", sql.NVarChar(120), input.detectedContentType)
      .input("normalizedFileName", sql.NVarChar(255), input.normalizedFileName)
      .input("originalFileName", sql.NVarChar(255), input.originalFileName ?? null)
      .query(`
        UPDATE absence_request_attachments
        SET status = N'AVAILABLE',
            object_generation = @generation,
            size_bytes = @sizeBytes,
            checksum_sha256 = @checksumSha256,
            detected_content_type = @detectedContentType,
            normalized_file_name = @normalizedFileName,
            original_file_name = COALESCE(@originalFileName, original_file_name),
            available_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME(),
            last_error = NULL
        OUTPUT INSERTED.*
        WHERE id = @id
          AND company_id = @companyId
          AND status = N'UPLOADING'
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapAbsenceAttachmentRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Lock parent request/draft, validate active count + reserved bytes, insert PENDING_UPLOAD.
   */
  async reservePendingUploadAtomic(
    input: CreateAttachmentMetadataInput & {
      maxFiles: number;
      maxTotalBytes: number;
      reservedBytes: number;
    },
  ): Promise<AbsenceRequestAttachment> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      if (input.absenceRequestId) {
        const locked = await new sql.Request(transaction)
          .input("companyId", sql.UniqueIdentifier, input.companyId)
          .input("requestId", sql.UniqueIdentifier, input.absenceRequestId)
          .query(`
            SELECT TOP 1 id
            FROM absence_requests WITH (UPDLOCK, HOLDLOCK)
            WHERE id = @requestId AND company_id = @companyId
          `);
        if (!locked.recordset[0]) {
          throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud no encontrada");
        }
      } else if (input.draftId) {
        const draft = await absenceRequestDraftRepository.lockOpenDraft(
          input.companyId,
          input.draftId,
          transaction,
        );
        if (!draft) {
          throw new AppError(409, "ABSENCE_DRAFT_NOT_OPEN", "El borrador no acepta adjuntos");
        }
      } else {
        throw new AppError(400, "ATTACHMENT_SCOPE_REQUIRED", "Se requiere requestId o draftId");
      }

      const scopeSql = input.absenceRequestId
        ? "absence_request_id = @scopeId"
        : "draft_id = @scopeId";
      const stats = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input(
          "scopeId",
          sql.UniqueIdentifier,
          input.absenceRequestId ?? input.draftId!,
        )
        .query(`
          SELECT
            COUNT(1) AS active_count,
            COALESCE(SUM(CAST(size_bytes AS BIGINT)), 0) AS total_bytes
          FROM absence_request_attachments WITH (UPDLOCK, HOLDLOCK)
          WHERE company_id = @companyId
            AND ${scopeSql}
            AND status IN (${ACTIVE_STATUSES_SQL})
        `);
      const activeCount = Number(stats.recordset[0]?.active_count ?? 0);
      const totalBytes = Number(stats.recordset[0]?.total_bytes ?? 0);
      if (activeCount >= input.maxFiles) {
        throw new AppError(
          413,
          "ATTACHMENT_COUNT_EXCEEDED",
          `Máximo de ${input.maxFiles} archivos por solicitud`,
        );
      }
      if (totalBytes + input.reservedBytes > input.maxTotalBytes) {
        throw new AppError(
          413,
          "ATTACHMENT_TOTAL_SIZE_EXCEEDED",
          "Se superó el tamaño total permitido de adjuntos",
        );
      }

      const row = await this.create(
        {
          ...input,
          sizeBytes: 0,
          checksumSha256: ATTACHMENT_CHECKSUM_PENDING,
          status: "PENDING_UPLOAD",
          detectedContentType: input.detectedContentType || "application/octet-stream",
        },
        transaction,
      );
      await transaction.commit();
      return row;
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
   * After GCS upload: re-check total size under lock, then AVAILABLE.
   */
  async finalizeAvailableAtomic(
    companyId: string,
    attachmentId: string,
    input: {
      objectGeneration: string;
      sizeBytes: number;
      checksumSha256: string;
      detectedContentType: string;
      normalizedFileName: string;
      originalFileName: string;
      maxTotalBytes: number;
    },
  ): Promise<AbsenceRequestAttachment> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const currentResult = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("id", sql.UniqueIdentifier, attachmentId)
        .query(`
          SELECT TOP 1 *
          FROM absence_request_attachments WITH (UPDLOCK, HOLDLOCK)
          WHERE id = @id AND company_id = @companyId
        `);
      const currentRow = currentResult.recordset[0] as Record<string, unknown> | undefined;
      if (!currentRow) {
        throw new AppError(404, "ATTACHMENT_NOT_FOUND", "Adjunto no encontrado");
      }
      const current = mapAbsenceAttachmentRow(currentRow);
      assertAttachmentStatusTransition(current.status, "AVAILABLE");

      const scopeSql = current.absenceRequestId
        ? "absence_request_id = @scopeId"
        : "draft_id = @scopeId";
      const scopeId = current.absenceRequestId ?? current.draftId;
      if (!scopeId) {
        throw new AppError(500, "ATTACHMENT_SCOPE_MISSING", "Adjunto sin alcance válido");
      }

      const stats = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("scopeId", sql.UniqueIdentifier, scopeId)
        .input("id", sql.UniqueIdentifier, attachmentId)
        .query(`
          SELECT COALESCE(SUM(CAST(size_bytes AS BIGINT)), 0) AS total_bytes
          FROM absence_request_attachments WITH (UPDLOCK, HOLDLOCK)
          WHERE company_id = @companyId
            AND ${scopeSql}
            AND id <> @id
            AND status IN (${ACTIVE_STATUSES_SQL})
        `);
      const otherBytes = Number(stats.recordset[0]?.total_bytes ?? 0);
      if (otherBytes + input.sizeBytes > input.maxTotalBytes) {
        throw new AppError(
          413,
          "ATTACHMENT_TOTAL_SIZE_EXCEEDED",
          "Se superó el tamaño total permitido de adjuntos",
        );
      }

      const updated = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("id", sql.UniqueIdentifier, attachmentId)
        .input("generation", sql.BigInt, input.objectGeneration)
        .input("sizeBytes", sql.BigInt, input.sizeBytes)
        .input("checksumSha256", sql.Char(64), input.checksumSha256)
        .input("detectedContentType", sql.NVarChar(120), input.detectedContentType)
        .input("normalizedFileName", sql.NVarChar(255), input.normalizedFileName)
        .input("originalFileName", sql.NVarChar(255), input.originalFileName)
        .query(`
          UPDATE absence_request_attachments
          SET status = N'AVAILABLE',
              object_generation = @generation,
              size_bytes = @sizeBytes,
              checksum_sha256 = @checksumSha256,
              detected_content_type = @detectedContentType,
              normalized_file_name = @normalizedFileName,
              original_file_name = @originalFileName,
              available_at = SYSUTCDATETIME(),
              updated_at = SYSUTCDATETIME(),
              last_error = NULL
          OUTPUT INSERTED.*
          WHERE id = @id
            AND company_id = @companyId
            AND status = N'UPLOADING'
        `);
      if (!updated.recordset[0]) {
        throw new AppError(
          500,
          "ATTACHMENT_SQL_UPDATE_FAILED",
          "El archivo se subió pero no se pudo actualizar la metadata",
        );
      }
      await transaction.commit();
      return mapAbsenceAttachmentRow(updated.recordset[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  async markFailed(
    companyId: string,
    attachmentId: string,
    lastError: string,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, attachmentId)
      .input("lastError", sql.NVarChar(1000), lastError.slice(0, 1000))
      .query(`
        UPDATE absence_request_attachments
        SET status = N'FAILED',
            last_error = @lastError,
            attempt_count = attempt_count + 1,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.id
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PENDING_UPLOAD', N'UPLOADING')
      `);
    return Boolean(result.recordset[0]);
  },

  async markStatus(
    companyId: string,
    attachmentId: string,
    status: AbsenceAttachmentStatus,
    extra?: {
      lastError?: string | null;
      deletedByUserId?: string | null;
      deletionReason?: string | null;
      incrementAttempt?: boolean;
      expectedCurrentStatuses?: AbsenceAttachmentStatus[];
    },
    transaction?: sql.Transaction,
  ): Promise<AbsenceRequestAttachment | null> {
    const current = transaction
      ? await this.findByIdAnyForUpdate(companyId, attachmentId, transaction)
      : await this.findByIdAny(companyId, attachmentId);
    if (!current) {
      return null;
    }
    if (
      extra?.expectedCurrentStatuses &&
      !extra.expectedCurrentStatuses.includes(current.status)
    ) {
      return null;
    }
    assertAttachmentStatusTransition(current.status, status);

    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, attachmentId)
      .input("status", sql.NVarChar(30), status)
      .input("expectedStatus", sql.NVarChar(30), current.status)
      .input("incrementAttempt", sql.Int, extra?.incrementAttempt ? 1 : 0)
      .input("lastError", sql.NVarChar(1000), extra?.lastError?.slice(0, 1000) ?? null)
      .input("deletedByUserId", sql.UniqueIdentifier, extra?.deletedByUserId ?? null)
      .input("deletionReason", sql.NVarChar(500), extra?.deletionReason ?? null)
      .query(`
        UPDATE absence_request_attachments
        SET status = @status,
            last_error = COALESCE(@lastError, last_error),
            deleted_by_user_id = COALESCE(@deletedByUserId, deleted_by_user_id),
            deletion_reason = COALESCE(@deletionReason, deletion_reason),
            deleted_at = CASE WHEN @status = N'DELETED' THEN SYSUTCDATETIME() ELSE deleted_at END,
            attempt_count = attempt_count + @incrementAttempt,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id AND company_id = @companyId AND status = @expectedStatus
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapAbsenceAttachmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByIdAny(
    companyId: string,
    attachmentId: string,
  ): Promise<AbsenceRequestAttachment | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, attachmentId)
      .query(`
        SELECT TOP 1 *
        FROM absence_request_attachments
        WHERE id = @id AND company_id = @companyId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapAbsenceAttachmentRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Locks the attachment row for mutation (UPDLOCK, HOLDLOCK) within a transaction.
   * Compatible with approve's countAvailable UPDLOCK on AVAILABLE rows.
   */
  async findByIdAnyForUpdate(
    companyId: string,
    attachmentId: string,
    transaction: sql.Transaction,
  ): Promise<AbsenceRequestAttachment | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, attachmentId)
      .query(`
        SELECT TOP 1 *
        FROM absence_request_attachments WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @id AND company_id = @companyId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapAbsenceAttachmentRow(result.recordset[0] as Record<string, unknown>);
  },
  async findByIdempotencyKey(
    companyId: string,
    scope: { requestId?: string | null; draftId?: string | null },
    idempotencyKey: string,
  ): Promise<AbsenceRequestAttachment | null> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("idempotencyKey", sql.NVarChar(120), idempotencyKey);
    if (scope.requestId) {
      request.input("requestId", sql.UniqueIdentifier, scope.requestId);
      const result = await request.query(`
        SELECT TOP 1 *
        FROM absence_request_attachments
        WHERE company_id = @companyId
          AND absence_request_id = @requestId
          AND idempotency_key = @idempotencyKey
      `);
      if (!result.recordset[0]) {
        return null;
      }
      return mapAbsenceAttachmentRow(result.recordset[0] as Record<string, unknown>);
    }
    if (scope.draftId) {
      request.input("draftId", sql.UniqueIdentifier, scope.draftId);
      const result = await request.query(`
        SELECT TOP 1 *
        FROM absence_request_attachments
        WHERE company_id = @companyId
          AND draft_id = @draftId
          AND idempotency_key = @idempotencyKey
      `);
      if (!result.recordset[0]) {
        return null;
      }
      return mapAbsenceAttachmentRow(result.recordset[0] as Record<string, unknown>);
    }
    return null;
  },

  /**
   * Distributed claim for cleanup workers (UPDLOCK + READPAST + lease).
   */
  async claimNextForCleanup(input: {
    olderThanMinutes: number;
    leaseOwner: string;
    leaseSeconds: number;
    maxAttempts: number;
  }): Promise<AbsenceRequestAttachment | null> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const selected = await new sql.Request(transaction)
        .input("olderThanMinutes", sql.Int, input.olderThanMinutes)
        .input("maxAttempts", sql.Int, input.maxAttempts)
        .query(`
          SELECT TOP 1 *
          FROM absence_request_attachments WITH (UPDLOCK, READPAST)
          WHERE status IN (N'PENDING_UPLOAD', N'UPLOADING', N'FAILED', N'PENDING_DELETE')
            AND attempt_count < @maxAttempts
            AND updated_at < DATEADD(MINUTE, -@olderThanMinutes, SYSUTCDATETIME())
            AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
          ORDER BY updated_at ASC
        `);
      const row = selected.recordset[0] as Record<string, unknown> | undefined;
      if (!row) {
        await transaction.commit();
        return null;
      }

      const claimed = await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, String(row.id))
        .input("companyId", sql.UniqueIdentifier, String(row.company_id))
        .input("leaseOwner", sql.NVarChar(80), input.leaseOwner)
        .input("leaseSeconds", sql.Int, input.leaseSeconds)
        .query(`
          UPDATE absence_request_attachments
          SET lease_owner = @leaseOwner,
              lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE id = @id
            AND company_id = @companyId
            AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
        `);
      await transaction.commit();
      if (!claimed.recordset[0]) {
        return null;
      }
      return mapAbsenceAttachmentRow(claimed.recordset[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  async listForCleanup(
    statuses: AbsenceAttachmentStatus[],
    olderThanMinutes: number,
    limit: number,
  ): Promise<AbsenceRequestAttachment[]> {
    if (statuses.length === 0) {
      return [];
    }
    const allowed = new Set<string>(ABSENCE_ATTACHMENT_STATUSES);
    for (const status of statuses) {
      if (!allowed.has(status)) {
        throw new Error(`Invalid absence attachment status for SQL filter: ${status}`);
      }
    }

    const pool = getPool();
    const request = pool
      .request()
      .input("olderThanMinutes", sql.Int, olderThanMinutes)
      .input("limit", sql.Int, limit);

    const statusParams = statuses.map((status, index) => {
      const name = `status${index}`;
      request.input(name, sql.NVarChar(30), status);
      return `@${name}`;
    });

    const result = await request.query(`
        SELECT TOP (@limit) *
        FROM absence_request_attachments
        WHERE status IN (${statusParams.join(", ")})
          AND updated_at < DATEADD(MINUTE, -@olderThanMinutes, SYSUTCDATETIME())
          AND attempt_count < 10
          AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
        ORDER BY updated_at ASC
      `);
    return result.recordset.map((row) =>
      mapAbsenceAttachmentRow(row as Record<string, unknown>),
    );
  },

  async linkDraftAttachmentsToRequest(input: {
    companyId: string;
    draftId: string;
    requestId: string;
    transaction?: sql.Transaction;
  }): Promise<number> {
    const request = input.transaction
      ? new sql.Request(input.transaction)
      : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("draftId", sql.UniqueIdentifier, input.draftId)
      .input("requestId", sql.UniqueIdentifier, input.requestId)
      .query(`
        UPDATE absence_request_attachments
        SET absence_request_id = @requestId,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND draft_id = @draftId
          AND EXISTS (
            SELECT 1
            FROM absence_request_drafts d
            WHERE d.id = @draftId
              AND d.company_id = @companyId
              AND d.status = N'SUBMITTED'
              AND d.submitted_request_id = @requestId
          )
      `);
    return Number(result.rowsAffected[0] ?? 0);
  },
};
