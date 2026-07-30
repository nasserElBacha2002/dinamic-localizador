import { Router } from "express";
import { absenceAttachmentController } from "../controllers/absence-attachment.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { acceptSingleMultipartFileStream } from "../middleware/multipart-file-stream";
import { validate } from "../middleware/validate";
import { absenceRequestIdParamSchema } from "../schemas/absence-request.schema";
import { z } from "zod";

const attachmentIdParamSchema = z.object({
  id: z.string().uuid("UUID de solicitud inválido"),
  attachmentId: z.string().uuid("UUID de adjunto inválido"),
});

export const absenceAttachmentRouter = Router({ mergeParams: true });

absenceAttachmentRouter.get(
  "/storage-health",
  requirePermission("company:settings:update"),
  asyncHandler(absenceAttachmentController.storageHealth),
);

absenceAttachmentRouter.get(
  "/:id/attachments",
  requirePermission("absences:review"),
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceAttachmentController.list),
);

absenceAttachmentRouter.post(
  "/:id/attachments",
  requirePermission("absences:review"),
  validate(absenceRequestIdParamSchema, "params"),
  acceptSingleMultipartFileStream("file"),
  asyncHandler(absenceAttachmentController.upload),
);

absenceAttachmentRouter.get(
  "/:id/attachments/:attachmentId/content",
  requirePermission("absences:review"),
  validate(attachmentIdParamSchema, "params"),
  asyncHandler(absenceAttachmentController.download),
);

absenceAttachmentRouter.delete(
  "/:id/attachments/:attachmentId",
  requirePermission("absences:review"),
  validate(attachmentIdParamSchema, "params"),
  asyncHandler(absenceAttachmentController.remove),
);
