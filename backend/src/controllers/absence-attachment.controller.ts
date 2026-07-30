import type { Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { absenceAttachmentService } from "../services/absence-attachment.service";
import { buildContentDisposition } from "../utils/absence-attachments/content-disposition";
import { absenceAttachmentMetrics } from "../utils/absence-attachments/metrics";
import { requireRequestCompanyId } from "../utils/request-company";

const requireIdempotencyKey = (req: Request): string => {
  const idempotencyKey =
    (typeof req.headers["idempotency-key"] === "string"
      ? req.headers["idempotency-key"]
      : null) ??
    (typeof req.multipartFields?.idempotencyKey === "string"
      ? req.multipartFields.idempotencyKey
      : null) ??
    (typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : null);
  if (!idempotencyKey || idempotencyKey.trim().length < 8) {
    throw new AppError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Header Idempotency-Key es obligatorio para uploads",
    );
  }
  return idempotencyKey.trim();
};

export const absenceAttachmentController = {
  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const requestId = String(req.params.id);
    const data = await absenceAttachmentService.list(companyId, requestId);
    res.status(200).json({ data });
  },

  async upload(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const requestId = String(req.params.id);
    const file = req.fileStream;
    if (!file) {
      throw new AppError(400, "ATTACHMENT_FILE_REQUIRED", "Debe enviar un archivo");
    }
    const idempotencyKey = requireIdempotencyKey(req);
    const abort = new AbortController();
    // Only abort on true client abort — not on req "close" after multipart is consumed
    // (that would destroy the stream while GCS is still finishing the write).
    req.on("aborted", () => abort.abort());

    const data = await absenceAttachmentService.uploadFromStream({
      companyId,
      requestId,
      body: file.stream,
      originalFileName: file.fileName || "file",
      declaredContentType: file.mimeType || "application/octet-stream",
      source: "ADMIN",
      uploadedByUserId: req.auth!.userId,
      idempotencyKey,
      signal: abort.signal,
    });
    res.status(201).json({ data });
  },

  async download(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const requestId = String(req.params.id);
    const attachmentId = String(req.params.attachmentId);
    const result = await absenceAttachmentService.openDownloadStream({
      companyId,
      requestId,
      attachmentId,
    });

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Length", String(result.contentLength));
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition(result.disposition, result.fileName),
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    let completed = false;
    const fail = (errorCode: string) => {
      if (completed) {
        return;
      }
      absenceAttachmentMetrics.downloadFailed({
        operation: "download",
        source: result.source,
        errorCode,
      });
    };

    result.stream.on("error", () => {
      fail("STREAM_ERROR");
      if (!res.headersSent) {
        res.status(502).end();
      } else {
        res.destroy();
      }
    });
    res.on("close", () => {
      if (!completed) {
        fail("CLIENT_DISCONNECTED");
        result.stream.destroy();
      }
    });
    result.stream.on("end", () => {
      completed = true;
      absenceAttachmentMetrics.downloadCompleted({
        operation: "download",
        source: result.source,
        status: "AVAILABLE",
      });
    });
    result.stream.pipe(res);
  },

  async remove(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const requestId = String(req.params.id);
    const attachmentId = String(req.params.attachmentId);
    const data = await absenceAttachmentService.softDelete({
      companyId,
      requestId,
      attachmentId,
      deletedByUserId: req.auth!.userId,
    });
    res.status(200).json({ data });
  },

  async storageHealth(req: Request, res: Response) {
    requireRequestCompanyId(req);
    const health = await absenceAttachmentService.getStorageHealth();
    const enabled = await absenceAttachmentService.isFeatureEnabled(
      requireRequestCompanyId(req),
    );
    res.status(200).json({
      data: {
        featureEnabled: enabled,
        storageConfigured: health.configured,
        storageAvailable: health.available,
        message: health.message ?? null,
      },
    });
  },
};
