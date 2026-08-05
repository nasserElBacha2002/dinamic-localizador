import type { Request, Response } from "express";
import { platformCompanyService } from "../services/platform-company.service";
import { companyLifecycleService } from "../services/company-lifecycle.service";

export const platformCompanyController = {
  async listCompanies(_req: Request, res: Response) {
    const companies = await platformCompanyService.listCompanies();
    res.status(200).json({ data: companies });
  },

  async createCompany(req: Request, res: Response) {
    const result = await platformCompanyService.createCompany(req.body, req.auth!.userId);
    res.status(201).json(result);
  },

  async deactivateCompany(req: Request, res: Response) {
    const companyId = String(req.params.companyId);
    const data = await companyLifecycleService.deactivate(
      companyId,
      req.auth!.userId,
      req.body.reason,
    );
    res.status(200).json({ data });
  },

  async reactivateCompany(req: Request, res: Response) {
    const companyId = String(req.params.companyId);
    const data = await companyLifecycleService.reactivate(companyId, req.auth!.userId);
    res.status(200).json({ data });
  },

  async getDeletionStatus(req: Request, res: Response) {
    const companyId = String(req.params.companyId);
    const data = await companyLifecycleService.getDeletionStatus(companyId);
    res.status(200).json({ data });
  },
};
