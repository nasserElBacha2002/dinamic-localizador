import type { Request, Response } from "express";
import { companyService } from "../services/company.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const companyController = {
  async listForCurrentUser(req: Request, res: Response) {
    const companies = await companyService.listForUser(req.auth!.userId);
    res.status(200).json({ data: companies });
  },

  async getSettings(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const settings = await companyService.getSettings(companyId);
    res.status(200).json({ data: settings });
  },

  async updateSettings(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const settings = await companyService.updateSettings(
      companyId,
      req.companyRole!,
      req.body,
    );
    res.status(200).json({ data: settings });
  },

  async getMembership(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    res.status(200).json({
      data: {
        companyId,
        companyName: req.company!.name,
        role: req.companyRole,
        permissions: Array.from(req.permissions ?? []),
      },
    });
  },
};
