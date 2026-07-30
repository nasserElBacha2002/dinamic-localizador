import { AppError } from "../errors/app-error";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type { AbsenceRequestAttachmentDto } from "../types/absence-attachment";
import { toAbsenceAttachmentDto } from "../types/absence-attachment";
import { absenceAttachmentMetrics } from "../utils/absence-attachments/metrics";
import { auditService } from "./audit.service";
import { assertAttachmentsFeatureEnabled } from "./attachment-policy.service";
import { getAttachmentStorage } from "./attachment-storage";

const assertRequestEditableForAttachments = async (
  companyId: string,
  requestId: string,
) => {
  const request = await absenceRequestRepository.findById(companyId, requestId);
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
  return request;
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
    await assertRequestEditableForAttachments(input.companyId, input.requestId);

    const row = await absenceAttachmentRepository.findById(
      input.companyId,
      input.requestId,
      input.attachmentId,
    );
    if (!row || row.status === "DELETED") {
      throw new AppError(404, "ATTACHMENT_NOT_FOUND", "Adjunto no encontrado");
    }

    await absenceAttachmentRepository.markStatus(
      input.companyId,
      input.attachmentId,
      "PENDING_DELETE",
      {
        deletedByUserId: input.deletedByUserId,
        deletionReason: input.reason ?? "user_delete",
      },
    );

    try {
      const storage = getAttachmentStorage();
      await storage.deleteObject({
        objectKey: row.objectKey,
        generation: row.objectGeneration ?? undefined,
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
        previousData: { status: row.status },
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
};
