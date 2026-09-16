import type { Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { companyReportEmailRecipientRepository } from "../repositories/company-report-email-recipient.repository";
import type {
  CreateCompanyReportEmailRecipientInput,
  UpdateCompanyReportEmailRecipientInput,
} from "../schemas/company-report-email-recipient.schema";
import { requireRequestCompanyId } from "../utils/request-company";

export const companyReportEmailRecipientController = {
  async list(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const data = await companyReportEmailRecipientRepository.listByCompany(companyId);
    res.json({ data });
  },

  async create(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const body = req.body as CreateCompanyReportEmailRecipientInput;
    try {
      const created = await companyReportEmailRecipientRepository.create(companyId, body);
      res.status(201).json({ data: created });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "INVALID_EMAIL") {
        throw new AppError(400, "INVALID_EMAIL", "El email no es válido.");
      }
      if (code === "DUPLICATE_EMAIL") {
        throw new AppError(
          409,
          "DUPLICATE_EMAIL",
          "Ya existe un destinatario activo con ese email en la compañía.",
        );
      }
      throw error;
    }
  },

  async update(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const recipientId = String(req.params.recipientId);
    const body = req.body as UpdateCompanyReportEmailRecipientInput;
    try {
      const updated = await companyReportEmailRecipientRepository.update(
        companyId,
        recipientId,
        body,
      );
      if (!updated) {
        throw new AppError(404, "NOT_FOUND", "Destinatario no encontrado.");
      }
      res.json({ data: updated });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const code = (error as { code?: string }).code;
      if (code === "INVALID_EMAIL") {
        throw new AppError(400, "INVALID_EMAIL", "El email no es válido.");
      }
      if (code === "DUPLICATE_EMAIL") {
        throw new AppError(
          409,
          "DUPLICATE_EMAIL",
          "Ya existe un destinatario activo con ese email en la compañía.",
        );
      }
      throw error;
    }
  },

  async remove(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const recipientId = String(req.params.recipientId);
    const disabled = await companyReportEmailRecipientRepository.disable(companyId, recipientId);
    if (!disabled) {
      throw new AppError(404, "NOT_FOUND", "Destinatario no encontrado.");
    }
    res.status(204).send();
  },
};
