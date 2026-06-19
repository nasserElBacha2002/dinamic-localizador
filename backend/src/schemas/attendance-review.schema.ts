import { z } from "zod";
import { paginationQuerySchema } from "./common.schema";

export const attendanceReviewsQuerySchema = paginationQuerySchema;

export const reviewAttendanceSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(1, "El motivo es obligatorio").max(1000),
});

export type ReviewAttendanceInput = z.infer<typeof reviewAttendanceSchema>;
