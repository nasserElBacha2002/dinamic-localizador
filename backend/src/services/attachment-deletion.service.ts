import sql from "mssql";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type { AbsenceRequestAttachmentDto } from "../types/absence-attachment";
import { toAbsenceAttachmentDto } from "../types/absence-attachment";
import { absenceAttachmentMetrics } from "../utils/absence-attachments/metrics";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import { auditService } from "./audit.service";
import { assertAttachmentsFeatureEnabled } from "./attachment-policy.service";
import { getAttachmentStorage } from "./attachment-storage";

/**
 * Soft-delete SQL phase: request row lock → attachment UPDLOCK → PENDING_DELETE.
 * Same lock order as approve (request → AVAILABLE attachments) so H3 races serialize.
 */
const markPendingDeleteInTransaction = async (input: {
  companyId: string;
  requestId: string;
  attachmentId: string;
  deletedByUserId: string | null;
  reason?: string;
}) => {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const request = await absenceRequestRepository.findByIdForUpdate(
      input.companyId,
      input.requestId,
      transaction,
    );
    if (!request) {
      throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud no encontrada");
    }
    if (!["PENDING", "NEEDS_INFO"].includes(request.status)) {
      throw new AppError(
        409,
        "ABSENCE_ATTACHMENT_LOCKED",
        "No se pueden modificar adjuntos en el estado actual de la solicitud",
      );
    }

    const row = await absenceAttachmentRepository.findByIdAnyForUpdate(
      input.companyId,
      input.attachmentId,
      transaction,
    );
    if (!row || row.status === "DELETED" || row.absenceRequestId !== input.requestId) {
      throw new AppError(404, "ATTACHMENT_NOT_FOUND", "Adjunto no encontrado");
    }

    const pending = await absenceAttachmentRepository.markStatus(
      input.companyId,
      input.attachmentId,
      "PENDING_DELETE",
      {
        deletedByUserId: input.deletedByUserId,
        deletionReason: input.reason ?? "user_delete",
        expectedCurrentStatuses: [row.status],
      },
      transaction,
    );
    if (!pending) {
      throw new AppError(
        409,
        "ATTACHMENT_STATUS_CONFLICT",
        "El adjunto cambió de estado. Reintentá.",
      );
    }

    await transaction.commit();
    return pending;
  } catch (error) {
    return rollbackTransactionSafely(
      transaction,
      {
        operation: "attachment-deletion.markPendingDelete",
        companyId: input.companyId,
        entityId: input.attachmentId,
      },
      error,
    );
  }
};

export const attachmentDeletionService = {
  async softDelete(input: {
    companyId: string;
    requestId: string;
    attachmentId: string;
    deletedByUserId: string | null;
    reason?: string;
  }): Promise<AbsenceRequestAttachmentDto> {
    await assertAttachmentsFeatureEnabled(input.companyId);

    const pending = await markPendingDeleteInTransaction(input);

    try {
      const storage = getAttachmentStorage();
      await storage.deleteObject({
        objectKey: pending.objectKey,
        generation: pending.objectGeneration ?? undefined,
      });
    } catch (error) {
      absenceAttachmentMetrics.deleteFailed({
        operation: "delete",
        errorCode: error instanceof AppError ? error.code : "DELETE_FAILED",
      });
      throw new AppError(
        502,
        "GCS_DELETE_FAILED",
        "No se pudo completar la eliminación del adjunto; quedará pendiente de reintento",
      );
    }

    const deleted = await absenceAttachmentRepository.markStatus(
      input.companyId,
      input.attachmentId,
      "DELETED",
      {
        deletedByUserId: input.deletedByUserId,
        deletionReason: input.reason ?? "user_delete",
      },
    );
    if (!deleted) {
      throw new AppError(
        502,
        "ATTACHMENT_DELETE_SQL_FAILED",
        "El objeto se eliminó en storage pero no se pudo marcar DELETED; se reintentará",
      );
    }

    try {
      await auditService.log(input.companyId, {
        userId: input.deletedByUserId,
        action: "ABSENCE_ATTACHMENT_DELETED",
        entityType: "absence_request_attachment",
        entityId: input.attachmentId,
        previousData: { status: "PENDING_DELETE" },
        newData: { status: "DELETED" },
      });
    } catch (auditError) {
      console.error("[absence-attachment] audit failed after DELETED", {
        attachmentId: input.attachmentId,
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }

    return toAbsenceAttachmentDto(deleted);
  },

  /**
   * SQL-only soft delete for integrity tests (skips GCS). Same locking as softDelete SQL phase,
   * then marks DELETED in a follow-up so AVAILABLE disappears before approve can commit.
   */
  async softDeleteSqlOnlyForTests(input: {
    companyId: string;
    requestId: string;
    attachmentId: string;
    deletedByUserId: string | null;
    reason?: string;
  }): Promise<AbsenceRequestAttachmentDto> {
    await markPendingDeleteInTransaction(input);
    const deleted = await absenceAttachmentRepository.markStatus(
      input.companyId,
      input.attachmentId,
      "DELETED",
      {
        deletedByUserId: input.deletedByUserId,
        deletionReason: input.reason ?? "test_delete",
        expectedCurrentStatuses: ["PENDING_DELETE"],
      },
    );
    if (!deleted) {
      throw new AppError(
        502,
        "ATTACHMENT_DELETE_SQL_FAILED",
        "No se pudo marcar DELETED tras PENDING_DELETE",
      );
    }
    return toAbsenceAttachmentDto(deleted);
  },
};
