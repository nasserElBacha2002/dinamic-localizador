import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { dailyAttendanceReportService } from "../services/daily-attendance-report.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const triggerDailyAttendanceReportSchema = z.object({
  reportDate: z.string().trim().min(10).max(10),
  reason: z.string().trim().max(500).optional(),
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
        reason: body.reason,
      });
      // Synchronous processing — 200 with outcome (not a fire-and-forget 202).
      res.status(200).json({ data: result });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message = (error as { message?: string }).message;
      if (code === "COMPANY_SETTINGS_NOT_FOUND") {
        throw new AppError(404, "NOT_FOUND", "Configuración de empresa no encontrada.");
      }
      if (code === "INVALID_DATE") {
        throw new AppError(400, "INVALID_DATE", message ?? "Fecha inválida.");
      }
      if (code === "FUTURE_DATE") {
        throw new AppError(400, "FUTURE_DATE", message ?? "Fecha futura no permitida.");
      }
      if (code === "OUTSIDE_CATCHUP") {
        throw new AppError(400, "OUTSIDE_CATCHUP", message ?? "Fecha fuera de catch-up.");
      }
      if (code === "REPORT_RUN_NOT_FOUND") {
        throw new AppError(500, "REPORT_RUN_NOT_FOUND", "No se pudo crear la ejecución del reporte.");
      }
      if (code === "SCHEMA_INCOMPATIBLE") {
        throw new AppError(
          503,
          "SCHEMA_INCOMPATIBLE",
          message ?? "Esquema de destinatarios incompatible. Aplicá la migración 136.",
        );
      }
      throw error;
    }
  },
};
