import type { Readable } from "node:stream";
import { AppError } from "../errors/app-error";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import { isInlineDispositionMime } from "../utils/absence-attachments/file-validation";
import { absenceAttachmentMetrics } from "../utils/absence-attachments/metrics";
import { assertAttachmentsFeatureEnabled } from "./attachment-policy.service";
import { getAttachmentStorage } from "./attachment-storage";

export const attachmentDownloadService = {
  async openDownloadStream(input: {
    companyId: string;
    requestId: string;
    attachmentId: string;
  }): Promise<{
    stream: Readable;
    contentType: string;
    contentLength: number;
    fileName: string;
    disposition: "inline" | "attachment";
    source: string;
  }> {
    await assertAttachmentsFeatureEnabled(input.companyId);
    const row = await absenceAttachmentRepository.findById(
      input.companyId,
      input.requestId,
      input.attachmentId,
    );
    if (!row || row.status !== "AVAILABLE") {
      throw new AppError(404, "ATTACHMENT_NOT_FOUND", "Adjunto no encontrado");
    }

    absenceAttachmentMetrics.downloadStarted({
      operation: "download",
      source: row.source,
      normalizedMime: row.detectedContentType,
      status: "AVAILABLE",
    });

    try {
      const storage = getAttachmentStorage();
      const stream = await storage.getObjectStream({
        objectKey: row.objectKey,
        generation: row.objectGeneration ?? undefined,
      });

      return {
        stream,
        contentType: row.detectedContentType,
        contentLength: row.sizeBytes,
        fileName: row.normalizedFileName,
        disposition: isInlineDispositionMime(row.detectedContentType)
          ? "inline"
          : "attachment",
        source: row.source,
      };
    } catch (error) {
      absenceAttachmentMetrics.downloadFailed({
        operation: "download",
        source: row.source,
        errorCode: error instanceof AppError ? error.code : "DOWNLOAD_FAILED",
      });
      throw error;
    }
  },
};
