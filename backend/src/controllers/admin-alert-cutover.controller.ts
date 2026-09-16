import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { adminAlertCutoverService } from "../services/admin-alert-cutover.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const setAdminAlertDeliveryModeSchema = z.object({
  mode: z.enum(["WHATSAPP_LEGACY", "DAILY_EMAIL"]),
});

export const adminAlertCutoverController = {
  async setDeliveryMode(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const body = req.body as z.infer<typeof setAdminAlertDeliveryModeSchema>;
    const actorUserId = req.auth?.userId;
    if (!actorUserId) {
      throw new AppError(401, "UNAUTHORIZED", "Autenticación requerida.");
    }
    try {
      const result = await adminAlertCutoverService.setDeliveryMode({
        companyId,
        mode: body.mode,
        actorUserId,
      });
      res.status(200).json({ data: result });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message = (error as { message?: string }).message;
      if (code === "COMPANY_SETTINGS_NOT_FOUND") {
        throw new AppError(404, "NOT_FOUND", "Configuración de empresa no encontrada.");
      }
      if (
        code === "DAILY_REPORT_DISABLED" ||
        code === "NO_EMAIL_RECIPIENTS" ||
        code === "INVALID_TIMEZONE_OR_TIME" ||
        code === "SMTP_NOT_OPERATIONAL" ||
        code === "SCHEMA_INCOMPATIBLE"
      ) {
        throw new AppError(400, code, message ?? "No se pueden cumplir las precondiciones del cutover.");
      }
      throw error;
    }
  },
};
