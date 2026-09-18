import { Router } from "express";
import { attendanceController } from "../controllers/attendance.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requireAnyPermission, requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import { reviewAttendanceSchema, attendanceReviewsQuerySchema } from "../schemas/attendance-review.schema";
import {
  attendanceIdParamSchema,
  createAttendanceSchema,
  listAttendanceQuerySchema,
} from "../schemas/attendance.schema";
import {
  manualAttendanceMutationSchema,
  manualAttendancePreviewSchema,
} from "../schemas/manual-attendance.schema";

export const attendanceRouter = Router();

attendanceRouter.post(
  "/",
  requirePermission("attendance:review"),
  validate(createAttendanceSchema),
  asyncHandler(attendanceController.create),
);
attendanceRouter.post(
  "/manual/preview",
  requireAnyPermission("attendance:manual_create", "attendance:manual_edit"),
  validate(manualAttendancePreviewSchema),
  asyncHandler(attendanceController.previewManual),
);
attendanceRouter.post(
  "/manual",
  requirePermission("attendance:manual_create"),
  validate(manualAttendanceMutationSchema),
  asyncHandler(attendanceController.createManual),
);
attendanceRouter.patch(
  "/:id/manual",
  requirePermission("attendance:manual_edit"),
  validate(attendanceIdParamSchema, "params"),
  validate(manualAttendanceMutationSchema),
  asyncHandler(attendanceController.editManual),
);
attendanceRouter.get(
  "/",
  requirePermission("attendance:read"),
  validate(listAttendanceQuerySchema, "query"),
  asyncHandler(attendanceController.list),
);
attendanceRouter.get(
  "/export.csv",
  requirePermission("attendance:export"),
  validate(listAttendanceQuerySchema, "query"),
  asyncHandler(attendanceController.exportCsv),
);
attendanceRouter.patch(
  "/:id/review",
  requirePermission("attendance:review"),
  validate(attendanceIdParamSchema, "params"),
  validate(reviewAttendanceSchema),
  asyncHandler(attendanceController.review),
);
attendanceRouter.get(
  "/:id/reviews",
  requirePermission("attendance:read"),
  validate(attendanceIdParamSchema, "params"),
  validate(attendanceReviewsQuerySchema, "query"),
  asyncHandler(attendanceController.listReviews),
);
attendanceRouter.get(
  "/:id",
  requirePermission("attendance:read"),
  validate(attendanceIdParamSchema, "params"),
  asyncHandler(attendanceController.getById),
);
