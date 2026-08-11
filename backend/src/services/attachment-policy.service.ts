import {
  isAttachmentPolicySatisfied,
  resolveAttachmentPolicy,
} from "../domain/absence-attachment-policy";
import { AppError } from "../errors/app-error";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { absenceRequestDraftRepository } from "../repositories/absence-request-draft.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import type { AbsenceAttachmentPolicy } from "../types/absence-attachment";
import { getGcsUnavailableReason, isGcsConfigured } from "./attachment-storage";

/**
 * Attachments are always on for every company.
 * Uploads still require GCS to be configured and reachable.
 */
export const assertAttachmentsFeatureEnabled = async (
  _companyId: string,
): Promise<void> => {
  const gcsReason = getGcsUnavailableReason();
  if (gcsReason || !isGcsConfigured()) {
    throw new AppError(
      503,
      "GCS_NOT_CONFIGURED",
      `Almacenamiento de adjuntos no disponible: ${gcsReason ?? "GCS no configurado"}`,
    );
  }
};

export const attachmentPolicyService = {
  async isFeatureEnabled(_companyId: string): Promise<boolean> {
    return true;
  },

  resolvePolicyForType(absenceType: {
    attachmentPolicy?: AbsenceAttachmentPolicy | null;
    requiresAttachment?: boolean;
  }): AbsenceAttachmentPolicy {
    return resolveAttachmentPolicy({
      attachmentPolicy: absenceType.attachmentPolicy,
      requiresAttachment: absenceType.requiresAttachment,
    });
  },

  async assertNotForbidden(companyId: string, absenceTypeId: string): Promise<void> {
    const absenceType = await absenceTypeRepository.findById(companyId, absenceTypeId);
    if (!absenceType) {
      return;
    }
    const policy = this.resolvePolicyForType(absenceType);
    if (policy === "FORBIDDEN") {
      throw new AppError(
        409,
        "ABSENCE_ATTACHMENT_FORBIDDEN",
        "Este tipo de ausencia no admite adjuntos",
      );
    }
  },

  async assertRequiredAttachmentsSatisfiedForDraft(
    companyId: string,
    draftId: string,
    policy: AbsenceAttachmentPolicy,
  ): Promise<void> {
    if (policy !== "REQUIRED") {
      return;
    }
    const count = await absenceAttachmentRepository.countAvailableByDraft(
      companyId,
      draftId,
    );
    if (!isAttachmentPolicySatisfied(policy, count)) {
      throw new AppError(
        409,
        "ABSENCE_ATTACHMENT_REQUIRED",
        "Este tipo de ausencia requiere al menos un adjunto disponible antes de enviar",
      );
    }
  },

  async assertRequiredAttachmentsSatisfied(
    companyId: string,
    requestId: string,
    absenceTypeId: string,
    transaction?: import("mssql").Transaction,
  ): Promise<void> {
    // Prefer request row already locked in the caller's transaction when provided.
    const request = transaction
      ? await absenceRequestRepository.findByIdForUpdate(companyId, requestId, transaction)
      : await absenceRequestRepository.findById(companyId, requestId);
    const absenceType = await absenceTypeRepository.findById(companyId, absenceTypeId);
    if (!absenceType) {
      throw new AppError(404, "ABSENCE_TYPE_NOT_FOUND", "Tipo de ausencia no encontrado");
    }
    const policy = resolveAttachmentPolicy({
      attachmentPolicy:
        request?.attachmentPolicySnapshot ?? absenceType.attachmentPolicy,
      requiresAttachment: absenceType.requiresAttachment,
    });
    if (policy !== "REQUIRED") {
      return;
    }
    const count = await absenceAttachmentRepository.countAvailable(
      companyId,
      requestId,
      transaction,
    );
    if (!isAttachmentPolicySatisfied(policy, count)) {
      throw new AppError(
        409,
        "ABSENCE_ATTACHMENT_REQUIRED",
        "Este tipo de ausencia requiere al menos un adjunto disponible",
      );
    }
  },

  async resolveUploadScope(input: {
    companyId: string;
    requestId?: string;
    draftId?: string;
  }): Promise<{ absenceTypeId: string }> {
    if (input.draftId) {
      const draft = await absenceRequestDraftRepository.findById(
        input.companyId,
        input.draftId,
      );
      if (!draft) {
        throw new AppError(404, "ABSENCE_DRAFT_NOT_FOUND", "Borrador no encontrado");
      }
      if (draft.status !== "OPEN") {
        throw new AppError(409, "ABSENCE_DRAFT_NOT_OPEN", "El borrador no acepta adjuntos");
      }
      if (draft.attachmentPolicySnapshot === "FORBIDDEN") {
        throw new AppError(
          409,
          "ABSENCE_ATTACHMENT_FORBIDDEN",
          "Este tipo no admite adjuntos",
        );
      }
      return { absenceTypeId: draft.absenceTypeId };
    }
    if (input.requestId) {
      const request = await absenceRequestRepository.findById(
        input.companyId,
        input.requestId,
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
      await this.assertNotForbidden(input.companyId, request.absenceTypeId);
      return { absenceTypeId: request.absenceTypeId };
    }
    throw new AppError(400, "ATTACHMENT_SCOPE_REQUIRED", "Se requiere requestId o draftId");
  },
};
