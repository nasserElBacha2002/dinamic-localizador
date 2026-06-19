import { Router } from "express";
import { attendanceController } from "../controllers/attendance.controller";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import { reviewAttendanceSchema, attendanceReviewsQuerySchema } from "../schemas/attendance-review.schema";
import {
  attendanceIdParamSchema,
  createAttendanceSchema,
  listAttendanceQuerySchema,
} from "../schemas/attendance.schema";

export const attendanceRouter = Router();

attendanceRouter.post("/", validate(createAttendanceSchema), asyncHandler(attendanceController.create));
attendanceRouter.get("/", validate(listAttendanceQuerySchema, "query"), asyncHandler(attendanceController.list));
attendanceRouter.get(
  "/export.csv",
  validate(listAttendanceQuerySchema, "query"),
  asyncHandler(attendanceController.exportCsv),
);
attendanceRouter.patch(
  "/:id/review",
  validate(attendanceIdParamSchema, "params"),
  validate(reviewAttendanceSchema),
  asyncHandler(attendanceController.review),
);
attendanceRouter.get(
  "/:id/reviews",
  validate(attendanceIdParamSchema, "params"),
  validate(attendanceReviewsQuerySchema, "query"),
  asyncHandler(attendanceController.listReviews),
);
attendanceRouter.get("/:id", validate(attendanceIdParamSchema, "params"), asyncHandler(attendanceController.getById));
