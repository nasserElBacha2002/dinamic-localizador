import type { Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { payrollReceiptService } from "../services/payroll-receipt.service";
import { payrollReceiptMetrics } from "../utils/payroll-receipts/metrics";
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
      "Header Idempotency-Key es obligatorio para uploads (mínimo 8 caracteres)",
    );
  }
  return idempotencyKey.trim();
};

export const payrollReceiptController = {
  async createBatch(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await payrollReceiptService.createBatch(
      companyId,
      req.body,
      req.auth!.userId,
    );
    res.status(201).json({ data });
  },

  async listBatches(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await payrollReceiptService.listBatches(
      companyId,
      req.validatedQuery as never,
    );
    res.status(200).json(result);
  },

  async getBatch(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const batchId = String(req.params.batchId);
    const data = await payrollReceiptService.getBatch(companyId, batchId);
    res.status(200).json({ data });
  },

  async uploadToBatch(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const batchId = String(req.params.batchId);
    const file = req.fileStream;
    if (!file) {
      throw new AppError(400, "PAYROLL_RECEIPT_FILE_REQUIRED", "Debe enviar un archivo");
    }
    const idempotencyKey = requireIdempotencyKey(req);
    const abort = new AbortController();
    req.on("aborted", () => abort.abort());

    const data = await payrollReceiptService.uploadReceipt({
      companyId,
      batchId,
      body: file.stream,
      originalFileName: file.fileName || "file.pdf",
      declaredContentType: file.mimeType || "application/octet-stream",
      uploadedByUserId: req.auth!.userId,
      idempotencyKey,
      signal: abort.signal,
    });
    res.status(201).json({ data });
  },

  async listReceipts(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await payrollReceiptService.listReceipts(
      companyId,
      req.validatedQuery as never,
    );
    res.status(200).json(result);
  },

  async getReceipt(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await payrollReceiptService.getReceipt(companyId, String(req.params.id));
    res.status(200).json({ data });
  },

  async download(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const disposition =
      (req.validatedQuery as { disposition?: "inline" | "attachment" } | undefined)
        ?.disposition ?? "attachment";
    const result = await payrollReceiptService.openDownloadStream({
      companyId,
      receiptId: String(req.params.id),
      disposition,
      downloadedByUserId: req.auth!.userId,
    });

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Length", String(result.contentLength));
    res.setHeader("Content-Disposition", result.disposition);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    let completed = false;
    const fail = (errorCode: string) => {
      if (completed) return;
      payrollReceiptMetrics.downloadFailed({ operation: "download", errorCode });
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
      payrollReceiptMetrics.downloadCompleted({ operation: "download", status: "ASSOCIATED" });
    });
    result.stream.pipe(res);
  },

  async replace(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const file = req.fileStream;
    if (!file) {
      throw new AppError(400, "PAYROLL_RECEIPT_FILE_REQUIRED", "Debe enviar un archivo");
    }
    const idempotencyKey = requireIdempotencyKey(req);
    const abort = new AbortController();
    req.on("aborted", () => abort.abort());

    const data = await payrollReceiptService.replaceReceipt({
      companyId,
      receiptId: String(req.params.id),
      body: file.stream,
      originalFileName: file.fileName || "file.pdf",
      declaredContentType: file.mimeType || "application/octet-stream",
      uploadedByUserId: req.auth!.userId,
      idempotencyKey,
      signal: abort.signal,
    });
    res.status(201).json({ data });
  },

  async remove(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await payrollReceiptService.softDelete({
      companyId,
      receiptId: String(req.params.id),
      deletedByUserId: req.auth!.userId,
    });
    res.status(200).json({ data });
  },

  async reconcileAssociation(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await payrollReceiptService.reconcileAssociation({
      companyId,
      receiptId: String(req.params.id),
      uploadedByUserId: req.auth!.userId,
    });
    res.status(200).json({ data });
  },
};
