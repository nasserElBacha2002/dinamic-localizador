import { Router } from "express";
import { systemLogsController } from "../controllers/system-logs.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePlatformAdmin } from "../middleware/require-platform-admin";
import { validate } from "../middleware/validate";
import {
  systemLogIdParamSchema,
  systemLogsListQuerySchema,
} from "../schemas/system-logs.schema";

export const systemLogsRouter = Router();

systemLogsRouter.use(asyncHandler(requirePlatformAdmin));

systemLogsRouter.get(
  "/options",
  asyncHandler(systemLogsController.options),
);

systemLogsRouter.get(
  "/",
  validate(systemLogsListQuerySchema, "query"),
  asyncHandler(systemLogsController.list),
);

systemLogsRouter.get(
  "/:id/context",
  validate(systemLogIdParamSchema, "params"),
  asyncHandler(systemLogsController.getContext),
);

systemLogsRouter.get(
  "/:id",
  validate(systemLogIdParamSchema, "params"),
  asyncHandler(systemLogsController.getById),
);
