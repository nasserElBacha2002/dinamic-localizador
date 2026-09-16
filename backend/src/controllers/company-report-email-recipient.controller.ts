import type { Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { requireRequestCompanyId } from "../utils/request-company";

const DEPRECATED_MESSAGE =
  "Los destinatarios del reporte diario son los mismos usuarios de alertas WhatsApp (categoría operativas) con email en el perfil. Usá la configuración de alertas y reporte diario.";

/**
 * @deprecated Audience is company_alert_recipients (+ users.email).
 * Kept as 410 endpoints so old clients fail closed instead of writing a dead table.
 */
export const companyReportEmailRecipientController = {
  async list(req: Request, _res: Response): Promise<void> {
    requireRequestCompanyId(req);
    throw new AppError(410, "REPORT_EMAIL_RECIPIENTS_DEPRECATED", DEPRECATED_MESSAGE);
  },

  async create(req: Request, _res: Response): Promise<void> {
    requireRequestCompanyId(req);
    throw new AppError(410, "REPORT_EMAIL_RECIPIENTS_DEPRECATED", DEPRECATED_MESSAGE);
  },

  async update(req: Request, _res: Response): Promise<void> {
    requireRequestCompanyId(req);
    throw new AppError(410, "REPORT_EMAIL_RECIPIENTS_DEPRECATED", DEPRECATED_MESSAGE);
  },

  async remove(req: Request, _res: Response): Promise<void> {
    requireRequestCompanyId(req);
    throw new AppError(410, "REPORT_EMAIL_RECIPIENTS_DEPRECATED", DEPRECATED_MESSAGE);
  },
};
