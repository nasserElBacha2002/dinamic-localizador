import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { ATTENDANCE_NOTIFICATION_TYPES } from "../constants/attendance-notification";
import { AppError } from "../errors/app-error";
import { attendanceReminderService } from "../services/attendance-reminder.service";
import { runAttendanceReminderJobOnce } from "../jobs/attendance-reminder.job";

const testReminderSchema = z.object({
  inventoryId: z.uuid(),
  employeeId: z.uuid(),
  notificationType: z.enum(ATTENDANCE_NOTIFICATION_TYPES),
});

export const devReminderRouter = Router();

devReminderRouter.use((_req, _res, next) => {
  if (env.NODE_ENV === "production") {
    next(new AppError(404, "NOT_FOUND", "Recurso no encontrado"));
    return;
  }

  next();
});

devReminderRouter.post("/run", async (_req, res, next) => {
  try {
    const summary = await attendanceReminderService.runDueReminders();
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

devReminderRouter.post("/run-job-once", async (_req, res, next) => {
  try {
    await runAttendanceReminderJobOnce();
    res.status(200).json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

devReminderRouter.post("/test", async (req, res, next) => {
  try {
    const parsed = testReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Datos de prueba inválidos");
    }

    const outcome = await attendanceReminderService.sendTestReminder(parsed.data);
    res.status(200).json({
      status: "ok",
      outcome,
      notificationType: parsed.data.notificationType,
      inventoryId: parsed.data.inventoryId,
      employeeId: parsed.data.employeeId,
    });
  } catch (error) {
    next(error);
  }
});
