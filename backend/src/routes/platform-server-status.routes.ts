import { Router } from "express";
import { platformServerStatusController } from "../controllers/platform-server-status.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePlatformAdmin } from "../middleware/require-platform-admin";

export const platformServerStatusRouter = Router();

platformServerStatusRouter.use(asyncHandler(requirePlatformAdmin));

platformServerStatusRouter.get(
  "/status",
  asyncHandler(platformServerStatusController.getStatus),
);
