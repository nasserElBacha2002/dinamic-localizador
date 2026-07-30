import { Router } from "express";
import { absenceCalendarController } from "../controllers/absence-calendar.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  absenceCalendarDateIdParamSchema,
  absenceCalendarIdParamSchema,
  calculateAbsenceDurationSchema,
  createCalendarDateSchema,
  listCalendarDatesQuerySchema,
  updateAbsenceCalendarSchema,
  updateCalendarDateSchema,
} from "../schemas/absence-calendar.schema";

export const absenceCalendarRouter = Router();

absenceCalendarRouter.get(
  "/",
  requirePermission("company:read"),
  asyncHandler(absenceCalendarController.listCalendars),
);

absenceCalendarRouter.get(
  "/default",
  requirePermission("company:read"),
  asyncHandler(absenceCalendarController.getDefault),
);

absenceCalendarRouter.patch(
  "/:calendarId",
  requirePermission("company:settings:update"),
  validate(absenceCalendarIdParamSchema, "params"),
  validate(updateAbsenceCalendarSchema),
  asyncHandler(absenceCalendarController.updateCalendar),
);

absenceCalendarRouter.get(
  "/:calendarId/dates",
  requirePermission("company:read"),
  validate(absenceCalendarIdParamSchema, "params"),
  validate(listCalendarDatesQuerySchema, "query"),
  asyncHandler(absenceCalendarController.listDates),
);

absenceCalendarRouter.post(
  "/dates",
  requirePermission("company:settings:update"),
  validate(createCalendarDateSchema),
  asyncHandler(absenceCalendarController.createDate),
);

absenceCalendarRouter.patch(
  "/dates/:dateId",
  requirePermission("company:settings:update"),
  validate(absenceCalendarDateIdParamSchema, "params"),
  validate(updateCalendarDateSchema),
  asyncHandler(absenceCalendarController.updateDate),
);

export const absenceCalculateRouter = Router();

absenceCalculateRouter.post(
  "/calculate",
  requirePermission("absences:review"),
  validate(calculateAbsenceDurationSchema),
  asyncHandler(absenceCalendarController.calculate),
);
