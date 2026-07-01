import type { Request, Response } from "express";
import { platformCompanyService } from "../services/platform-company.service";

export const platformCompanyController = {
  async listCompanies(_req: Request, res: Response) {
    const companies = await platformCompanyService.listCompanies();
    res.status(200).json({ data: companies });
  },

  async createCompany(req: Request, res: Response) {
    const result = await platformCompanyService.createCompany(req.body);
    res.status(201).json(result);
  },
};
