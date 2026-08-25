import { Router } from "express";
import { locationZoneController } from "../controllers/location-zone.controller";
import { requireAnyPermission } from "../middleware/company-context";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  createLocationZoneSchema,
  geocodeLocationZoneBodySchema,
  listLocationZonesQuerySchema,
  locationZoneIdParamSchema,
  updateLocationZoneSchema,
} from "../schemas/location-zone.schema";

export const locationZoneRouter = Router({ mergeParams: true });

locationZoneRouter.get(
  "/",
  validate(listLocationZonesQuerySchema, "query"),
  requireAnyPermission("employees:manage", "company:settings:update"),
  asyncHandler(locationZoneController.list),
);

locationZoneRouter.get(
  "/geocoding-summary",
  requireAnyPermission("employees:manage", "company:settings:update"),
  asyncHandler(locationZoneController.geocodingSummary),
);

locationZoneRouter.post(
  "/",
  validate(createLocationZoneSchema),
  requireAnyPermission("employees:manage", "company:settings:update"),
  asyncHandler(locationZoneController.create),
);

locationZoneRouter.patch(
  "/:zoneId",
  validate(locationZoneIdParamSchema, "params"),
  validate(updateLocationZoneSchema),
  requireAnyPermission("employees:manage", "company:settings:update"),
  asyncHandler(locationZoneController.update),
);

locationZoneRouter.post(
  "/:zoneId/geocode",
  validate(locationZoneIdParamSchema, "params"),
  validate(geocodeLocationZoneBodySchema),
  requireAnyPermission("employees:manage", "company:settings:update"),
  asyncHandler(locationZoneController.geocode),
);
