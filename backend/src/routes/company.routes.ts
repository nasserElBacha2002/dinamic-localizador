import { Router } from "express";
import { companyController } from "../controllers/company.controller";
import { resolveCompanyContext, requirePermission } from "../middleware/company-context";
import { requirePlatformAdmin } from "../middleware/require-platform-admin";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  companyIdParamSchema,
  companyRoleCapabilitiesParamSchema,
  updateCompanySettingsSchema,
  weeklySchedulePayloadSchema,
} from "../schemas/company.schema";
import { updateCompanyAbsenceSettingsSchema } from "../schemas/company-absence-settings.schema";
import {
  companyLocationTypeIdParamSchema,
  createCompanyLocationTypeSchema,
  listCompanyLocationTypesQuerySchema,
  updateCompanyLocationTypeSchema,
} from "../schemas/company-location-type.schema";
import { updateCompanyModulesSchema } from "../schemas/company-module.schema";
import {
  companyAlertRecipientIdParamSchema,
  createCompanyAlertRecipientSchema,
  updateCompanyAlertRecipientSchema,
} from "../schemas/company-alert-recipient.schema";
import { companyAlertRecipientController } from "../controllers/company-alert-recipient.controller";

export const companyRouter = Router();

companyRouter.get("/", asyncHandler(companyController.listForCurrentUser));

companyRouter.get(
  "/:companyId/me",
  validate(companyIdParamSchema, "params"),
  resolveCompanyContext,
  asyncHandler(companyController.getMembership),
);

companyRouter.get(
  "/:companyId/roles/:role/capabilities",
  validate(companyRoleCapabilitiesParamSchema, "params"),
  resolveCompanyContext,
  requirePermission("users:manage"),
  asyncHandler(companyController.getRoleCapabilities),
);

companyRouter.get(
  "/:companyId/settings",
  validate(companyIdParamSchema, "params"),
  resolveCompanyContext,
  requirePermission("company:read"),
  asyncHandler(companyController.getSettings),
);

companyRouter.patch(
  "/:companyId/settings",
  validate(companyIdParamSchema, "params"),
  validate(updateCompanySettingsSchema),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyController.updateSettings),
);

companyRouter.get(
  "/:companyId/settings/work-schedule",
  validate(companyIdParamSchema, "params"),
  resolveCompanyContext,
  requirePermission("company:read"),
  asyncHandler(companyController.getWorkSchedule),
);

companyRouter.put(
  "/:companyId/settings/work-schedule",
  validate(companyIdParamSchema, "params"),
  validate(weeklySchedulePayloadSchema),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyController.updateWorkSchedule),
);

companyRouter.get(
  "/:companyId/settings/absences",
  validate(companyIdParamSchema, "params"),
  resolveCompanyContext,
  requirePermission("company:read"),
  asyncHandler(companyController.getAbsenceSettings),
);

companyRouter.patch(
  "/:companyId/settings/absences",
  validate(companyIdParamSchema, "params"),
  validate(updateCompanyAbsenceSettingsSchema),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyController.updateAbsenceSettings),
);

companyRouter.get(
  "/:companyId/settings/location-types",
  validate(companyIdParamSchema, "params"),
  validate(listCompanyLocationTypesQuerySchema, "query"),
  resolveCompanyContext,
  requirePermission("company:read"),
  asyncHandler(companyController.listLocationTypes),
);

companyRouter.post(
  "/:companyId/settings/location-types",
  validate(companyIdParamSchema, "params"),
  validate(createCompanyLocationTypeSchema),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyController.createLocationType),
);

companyRouter.patch(
  "/:companyId/settings/location-types/:locationTypeId",
  validate(companyLocationTypeIdParamSchema, "params"),
  validate(updateCompanyLocationTypeSchema),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyController.updateLocationType),
);

companyRouter.delete(
  "/:companyId/settings/location-types/:locationTypeId",
  validate(companyLocationTypeIdParamSchema, "params"),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyController.disableLocationType),
);

companyRouter.get(
  "/:companyId/modules",
  validate(companyIdParamSchema, "params"),
  resolveCompanyContext,
  requirePermission("company:read"),
  asyncHandler(companyController.listModules),
);

companyRouter.patch(
  "/:companyId/modules",
  validate(companyIdParamSchema, "params"),
  validate(updateCompanyModulesSchema),
  resolveCompanyContext,
  asyncHandler(requirePlatformAdmin),
  asyncHandler(companyController.updateModules),
);

companyRouter.get(
  "/:companyId/company-alert-recipients",
  validate(companyIdParamSchema, "params"),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyAlertRecipientController.list),
);

companyRouter.post(
  "/:companyId/company-alert-recipients",
  validate(companyIdParamSchema, "params"),
  validate(createCompanyAlertRecipientSchema),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyAlertRecipientController.create),
);

companyRouter.patch(
  "/:companyId/company-alert-recipients/:recipientId",
  validate(companyAlertRecipientIdParamSchema, "params"),
  validate(updateCompanyAlertRecipientSchema),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyAlertRecipientController.update),
);

companyRouter.delete(
  "/:companyId/company-alert-recipients/:recipientId",
  validate(companyAlertRecipientIdParamSchema, "params"),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyAlertRecipientController.remove),
);
