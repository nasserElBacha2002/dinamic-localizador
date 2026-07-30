import { AppError } from "../errors/app-error";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type { AbsenceRequestAttachmentDto } from "../types/absence-attachment";
import { toAbsenceAttachmentDto } from "../types/absence-attachment";
import { attachmentCleanupService } from "./attachment-cleanup.service";
import { attachmentDeletionService } from "./attachment-deletion.service";
import { attachmentDownloadService } from "./attachment-download.service";
import { attachmentPolicyService } from "./attachment-policy.service";
import { attachmentUploadService } from "./attachment-upload.service";
import {
  getAttachmentStorage,
  getGcsUnavailableReason,
  isGcsConfigured,
} from "./attachment-storage";

/**
 * Facade over attachment use-case services (policy / upload / download / deletion / cleanup).
 */
export const absenceAttachmentService = {
  isFeatureEnabled: attachmentPolicyService.isFeatureEnabled.bind(attachmentPolicyService),
  assertNotForbidden: attachmentPolicyService.assertNotForbidden.bind(attachmentPolicyService),
  assertRequiredAttachmentsSatisfied:
    attachmentPolicyService.assertRequiredAttachmentsSatisfied.bind(attachmentPolicyService),
  assertRequiredAttachmentsSatisfiedForDraft:
    attachmentPolicyService.assertRequiredAttachmentsSatisfiedForDraft.bind(
      attachmentPolicyService,
    ),

  async getStorageHealth(): Promise<{
    configured: boolean;
    available: boolean;
    message?: string;
  }> {
    const reason = getGcsUnavailableReason();
    if (reason) {
      return { configured: false, available: false, message: reason };
    }
    try {
      const storage = getAttachmentStorage();
      const probe = (await storage.checkAccess?.()) ?? { ok: true };
      return {
        configured: true,
        available: probe.ok,
        message: probe.message,
      };
    } catch (error) {
      return {
        configured: true,
        available: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async list(
    companyId: string,
    requestId: string,
  ): Promise<AbsenceRequestAttachmentDto[]> {
    const request = await absenceRequestRepository.findById(companyId, requestId);
    if (!request) {
      throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud no encontrada");
    }
    const rows = await absenceAttachmentRepository.listByRequest(companyId, requestId);
    return rows.map(toAbsenceAttachmentDto);
  },

  async countAvailable(companyId: string, requestId: string): Promise<number> {
    return absenceAttachmentRepository.countAvailable(companyId, requestId);
  },

  uploadFromStream: attachmentUploadService.uploadFromStream.bind(attachmentUploadService),
  uploadFromBuffer: attachmentUploadService.uploadFromBuffer.bind(attachmentUploadService),
  uploadFromBufferToDraft:
    attachmentUploadService.uploadFromBufferToDraft.bind(attachmentUploadService),
  openDownloadStream:
    attachmentDownloadService.openDownloadStream.bind(attachmentDownloadService),
  softDelete: attachmentDeletionService.softDelete.bind(attachmentDeletionService),
  processCleanupBatch:
    attachmentCleanupService.processCleanupBatch.bind(attachmentCleanupService),

  /** @deprecated Prefer isGcsConfigured from attachment-storage */
  isGcsConfigured,
};
