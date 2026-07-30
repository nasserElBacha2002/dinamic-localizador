import { Router } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { acceptSingleMultipartFileStream } from "../middleware/multipart-file-stream";
import { validate } from "../middleware/validate";
import { absenceDayPeriodSchema } from "../schemas/absence-request.schema";
import { absenceAttachmentService } from "../services/absence-attachment.service";
import { absenceRequestDraftService } from "../services/absence-request-draft.service";
import { requireRequestCompanyId } from "../utils/request-company";

const createDraftSchema = z.object({
  employeeId: z.string().uuid(),
  absenceTypeId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startPeriod: absenceDayPeriodSchema.default("FULL_DAY"),
  endPeriod: absenceDayPeriodSchema.default("FULL_DAY"),
  reason: z.string().trim().min(1).max(1000),
});

const draftIdParamSchema = z.object({
  draftId: z.string().uuid(),
});

const submitDraftSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const absenceRequestDraftRouter = Router();

absenceRequestDraftRouter.post(
  "/",
  requirePermission("absences:review"),
  validate(createDraftSchema),
  asyncHandler(async (req, res) => {
    const companyId = requireRequestCompanyId(req);
    const data = await absenceRequestDraftService.create(
      companyId,
      req.body,
      req.auth!.userId,
    );
    res.status(201).json({ data });
  }),
);

absenceRequestDraftRouter.get(
  "/:draftId",
  requirePermission("absences:review"),
  validate(draftIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const companyId = requireRequestCompanyId(req);
    const data = await absenceRequestDraftService.get(
      companyId,
      String(req.params.draftId),
    );
    res.status(200).json({ data });
  }),
);

absenceRequestDraftRouter.post(
  "/:draftId/submit",
  requirePermission("absences:review"),
  validate(draftIdParamSchema, "params"),
  validate(submitDraftSchema),
  asyncHandler(async (req, res) => {
    const companyId = requireRequestCompanyId(req);
    const data = await absenceRequestDraftService.submit(
      companyId,
      String(req.params.draftId),
      req.auth!.userId,
      req.body.idempotencyKey,
    );
    res.status(200).json({ data });
  }),
);

absenceRequestDraftRouter.post(
  "/:draftId/attachments",
  requirePermission("absences:review"),
  validate(draftIdParamSchema, "params"),
  acceptSingleMultipartFileStream("file"),
  asyncHandler(async (req, res) => {
    const companyId = requireRequestCompanyId(req);
    const file = req.fileStream;
    if (!file) {
      throw new AppError(400, "ATTACHMENT_FILE_REQUIRED", "Debe enviar un archivo");
    }
    const idempotencyKey =
      (typeof req.headers["idempotency-key"] === "string"
        ? req.headers["idempotency-key"]
        : null) ??
      (typeof req.multipartFields?.idempotencyKey === "string"
        ? req.multipartFields.idempotencyKey
        : null);
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new AppError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Header Idempotency-Key es obligatorio para uploads",
      );
    }
    const abort = new AbortController();
    req.on("aborted", () => abort.abort());
    const data = await absenceAttachmentService.uploadFromStream({
      companyId,
      draftId: String(req.params.draftId),
      body: file.stream,
      originalFileName: file.fileName || "file",
      declaredContentType: file.mimeType || "application/octet-stream",
      source: "ADMIN",
      uploadedByUserId: req.auth!.userId,
      idempotencyKey: idempotencyKey.trim(),
      signal: abort.signal,
    });
    res.status(201).json({ data });
  }),
);
