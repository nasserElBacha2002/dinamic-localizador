import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { dailyAttendanceReportService } from "../services/daily-attendance-report.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const triggerDailyAttendanceReportSchema = z.object({
  reportDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato YYYY-MM-DD."),
});

export const dailyAttendanceReportController = {
  async triggerManual(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const body = req.body as z.infer<typeof triggerDailyAttendanceReportSchema>;
    const actorUserId = req.auth?.userId;
    if (!actorUserId) {
      throw new AppError(401, "UNAUTHORIZED", "Autenticación requerida.");
    }
    try {
      const result = await dailyAttendanceReportService.triggerManual({
        companyId,
        reportDate: body.reportDate,
        actorUserId,
      });
      res.status(202).json({ data: result });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "COMPANY_SETTINGS_NOT_FOUND") {
        throw new AppError(404, "NOT_FOUND", "Configuración de empresa no encontrada.");
      }
      if (code === "REPORT_RUN_NOT_FOUND") {
        throw new AppError(500, "REPORT_RUN_NOT_FOUND", "No se pudo crear la ejecución del reporte.");
      }
      throw error;
    }
  },
};
