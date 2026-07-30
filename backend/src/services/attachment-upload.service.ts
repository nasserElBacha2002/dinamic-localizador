import { Readable } from "node:stream";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import type {
  AbsenceAttachmentSource,
  AbsenceRequestAttachmentDto,
} from "../types/absence-attachment";
import { toAbsenceAttachmentDto } from "../types/absence-attachment";
import {
  buildAbsenceAttachmentObjectKey,
  normalizeFileName,
  newAttachmentId,
  sanitizeOriginalFileName,
} from "../utils/absence-attachments/file-validation";
import { absenceAttachmentMetrics } from "../utils/absence-attachments/metrics";
import { AttachmentUploadTransform } from "../utils/absence-attachments/streaming-upload-transform";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { auditService } from "./audit.service";
import {
  assertAttachmentsFeatureEnabled,
  attachmentPolicyService,
} from "./attachment-policy.service";
import { getAttachmentStorage } from "./attachment-storage";

export type AttachmentUploadStreamInput = {
  companyId: string;
  requestId?: string;
  draftId?: string;
  body: Readable;
  originalFileName: string;
  declaredContentType: string;
  source: AbsenceAttachmentSource;
  uploadedByUserId?: string | null;
  uploadedByEmployeeId?: string | null;
  twilioMessageSid?: string | null;
  twilioMediaIndex?: number | null;
  idempotencyKey?: string | null;
  /** Optional abort signal (client disconnect / timeout). */
  signal?: AbortSignal;
};

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

export const attachmentUploadService = {
  async uploadFromStream(
    input: AttachmentUploadStreamInput,
  ): Promise<AbsenceRequestAttachmentDto> {
    await assertAttachmentsFeatureEnabled(input.companyId);
    await attachmentPolicyService.resolveUploadScope({
      companyId: input.companyId,
      requestId: input.requestId,
      draftId: input.draftId,
    });

    if (input.idempotencyKey) {
      const existingKey = await absenceAttachmentRepository.findByIdempotencyKey(
        input.companyId,
        { requestId: input.requestId, draftId: input.draftId },
        input.idempotencyKey,
      );
      if (existingKey && ["AVAILABLE", "UPLOADING", "PENDING_UPLOAD"].includes(existingKey.status)) {
        destroyQuietly(input.body);
        return toAbsenceAttachmentDto(existingKey);
      }
    }

    if (input.twilioMessageSid != null && input.twilioMediaIndex != null) {
      const existing = await absenceAttachmentRepository.findByTwilioMedia(
        input.companyId,
        input.twilioMessageSid,
        input.twilioMediaIndex,
      );
      if (existing) {
        destroyQuietly(input.body);
        return toAbsenceAttachmentDto(existing);
      }
    }

    const attachmentId = newAttachmentId();
    const storage = getAttachmentStorage();
    const bucketName = env.GCS_BUCKET_NAME!;
    const scopeId = input.requestId ?? input.draftId!;
    const objectKey = buildAbsenceAttachmentObjectKey({
      storagePrefix: env.GCS_STORAGE_PREFIX,
      companyId: input.companyId,
      absenceRequestId: scopeId,
      attachmentId,
    });
    const sanitizedName = sanitizeOriginalFileName(input.originalFileName);

    let row;
    try {
      row = await absenceAttachmentRepository.reservePendingUploadAtomic({
        id: attachmentId,
        companyId: input.companyId,
        absenceRequestId: input.requestId ?? null,
        draftId: input.draftId ?? null,
        bucketName,
        objectKey,
        originalFileName: sanitizedName,
        normalizedFileName: sanitizedName,
        declaredContentType: input.declaredContentType || "application/octet-stream",
        detectedContentType: "application/octet-stream",
        sizeBytes: 0,
        checksumSha256: "0".repeat(64),
        status: "PENDING_UPLOAD",
        scanStatus: "UNSCANNED",
        uploadedByUserId: input.uploadedByUserId ?? null,
        uploadedByEmployeeId: input.uploadedByEmployeeId ?? null,
        source: input.source,
        twilioMessageSid: input.twilioMessageSid ?? null,
        twilioMediaIndex: input.twilioMediaIndex ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        maxFiles: env.GCS_MAX_FILES_PER_REQUEST,
        maxTotalBytes: env.GCS_MAX_TOTAL_SIZE_BYTES,
        reservedBytes: env.GCS_MAX_FILE_SIZE_BYTES,
      });
    } catch (error) {
      destroyQuietly(input.body);
      if (
        isDuplicateKeyError(error) &&
        input.twilioMessageSid != null &&
        input.twilioMediaIndex != null
      ) {
        const dup = await absenceAttachmentRepository.findByTwilioMedia(
          input.companyId,
          input.twilioMessageSid,
          input.twilioMediaIndex,
        );
        if (dup) {
          return toAbsenceAttachmentDto(dup);
        }
      }
      if (isDuplicateKeyError(error) && input.idempotencyKey) {
        const dup = await absenceAttachmentRepository.findByIdempotencyKey(
          input.companyId,
          { requestId: input.requestId, draftId: input.draftId },
          input.idempotencyKey,
        );
        if (dup) {
          return toAbsenceAttachmentDto(dup);
        }
      }
      throw error;
    }

    await absenceAttachmentRepository.markStatus(
      input.companyId,
      attachmentId,
      "UPLOADING",
      { expectedCurrentStatuses: ["PENDING_UPLOAD"] },
    );

    absenceAttachmentMetrics.uploadStarted({
      operation: "upload",
      source: input.source,
    });

    const transform = new AttachmentUploadTransform(env.GCS_MAX_FILE_SIZE_BYTES);
    const onAbort = () => {
      destroyQuietly(input.body);
      destroyQuietly(transform);
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });
    input.body.on("error", onAbort);

    try {
      const stored = await storage.putObject({
        objectKey,
        body: input.body,
        transforms: [transform],
        contentType: input.declaredContentType || "application/octet-stream",
        ifGenerationMatch: 0,
        metadata: {
          "attachment-id": attachmentId,
          "company-id": input.companyId,
          "absence-request-id": input.requestId ?? "",
          "draft-id": input.draftId ?? "",
          "upload-source": input.source,
        },
      });

      const detected = transform.detectedContentType;
      const checksum = transform.checksumSha256;
      const sizeBytes = transform.sizeBytes;
      const normalized = normalizeFileName(sanitizedName, detected);

      if (input.idempotencyKey) {
        const prior = await absenceAttachmentRepository.findByIdempotencyKey(
          input.companyId,
          { requestId: input.requestId, draftId: input.draftId },
          input.idempotencyKey,
        );
        if (
          prior &&
          prior.id !== attachmentId &&
          prior.checksumSha256 &&
          prior.checksumSha256 !== "0".repeat(64) &&
          prior.checksumSha256 !== checksum
        ) {
          try {
            await storage.deleteObject({ objectKey, generation: stored.generation });
          } catch {
            /* orphan cleanup job */
          }
          await absenceAttachmentRepository.markFailed(
            input.companyId,
            attachmentId,
            "Idempotency checksum conflict",
          );
          throw new AppError(
            409,
            "ATTACHMENT_IDEMPOTENCY_CONFLICT",
            "La clave de idempotencia ya fue usada con otro archivo",
          );
        }
      }

      const meta = await storage.getObjectMetadata({
        objectKey,
        generation: stored.generation,
      });
      if (meta.sizeBytes !== sizeBytes) {
        throw new AppError(
          502,
          "GCS_SIZE_MISMATCH",
          "El tamaño del objeto en GCS no coincide",
        );
      }

      let available;
      try {
        available = await absenceAttachmentRepository.finalizeAvailableAtomic(
          input.companyId,
          attachmentId,
          {
            objectGeneration: stored.generation,
            sizeBytes: meta.sizeBytes,
            checksumSha256: checksum,
            detectedContentType: detected,
            normalizedFileName: normalized,
            originalFileName: sanitizedName,
            maxTotalBytes: env.GCS_MAX_TOTAL_SIZE_BYTES,
          },
        );
      } catch (finalizeError) {
        try {
          await storage.deleteObject({ objectKey, generation: stored.generation });
        } catch {
          /* cleanup job */
        }
        throw finalizeError;
      }

      try {
        await auditService.log(input.companyId, {
          userId: input.uploadedByUserId ?? null,
          action: "ABSENCE_ATTACHMENT_UPLOADED",
          entityType: "absence_request_attachment",
          entityId: attachmentId,
          newData: {
            absenceRequestId: input.requestId ?? null,
            draftId: input.draftId ?? null,
            status: "AVAILABLE",
            detectedContentType: detected,
            sizeBytes: meta.sizeBytes,
            source: input.source,
          },
        });
      } catch (auditError) {
        console.error("[absence-attachment] audit failed after AVAILABLE upload", {
          attachmentId,
          error: auditError instanceof Error ? auditError.message : String(auditError),
        });
      }

      absenceAttachmentMetrics.uploadCompleted({
        operation: "upload",
        source: input.source,
        normalizedMime: detected,
        status: "AVAILABLE",
      });

      return toAbsenceAttachmentDto(available);
    } catch (error) {
      destroyQuietly(input.body);
      destroyQuietly(transform);
      const message = error instanceof Error ? error.message : String(error);
      await absenceAttachmentRepository.markFailed(
        input.companyId,
        attachmentId,
        message,
      );
      absenceAttachmentMetrics.uploadFailed({
        operation: "upload",
        source: input.source,
        errorCode: error instanceof AppError ? error.code : "UPLOAD_FAILED",
      });
      try {
        await storage.deleteObject({ objectKey });
      } catch {
        /* PENDING_UPLOAD/FAILED cleanup job */
      }
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(502, "GCS_UPLOAD_FAILED", `Error al subir adjunto: ${message}`);
    } finally {
      input.signal?.removeEventListener("abort", onAbort);
    }
  },

  async uploadFromBuffer(input: {
    companyId: string;
    requestId?: string;
    draftId?: string;
    buffer: Buffer;
    originalFileName: string;
    declaredContentType: string;
    source: AbsenceAttachmentSource;
    uploadedByUserId?: string | null;
    uploadedByEmployeeId?: string | null;
    twilioMessageSid?: string | null;
    twilioMediaIndex?: number | null;
    idempotencyKey?: string | null;
  }): Promise<AbsenceRequestAttachmentDto> {
    return this.uploadFromStream({
      ...input,
      body: Readable.from(input.buffer),
    });
  },

  async uploadFromBufferToDraft(input: {
    companyId: string;
    draftId: string;
    buffer: Buffer;
    originalFileName: string;
    declaredContentType: string;
    uploadedByUserId: string;
    idempotencyKey: string;
  }): Promise<AbsenceRequestAttachmentDto> {
    return this.uploadFromStream({
      companyId: input.companyId,
      draftId: input.draftId,
      body: Readable.from(input.buffer),
      originalFileName: input.originalFileName,
      declaredContentType: input.declaredContentType,
      source: "ADMIN",
      uploadedByUserId: input.uploadedByUserId,
      idempotencyKey: input.idempotencyKey,
    });
  },
};
