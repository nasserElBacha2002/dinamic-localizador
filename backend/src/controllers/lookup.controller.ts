import type { Request, Response } from "express";
import { lookupService } from "../services/lookup.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const lookupController = {
  async listEmployees(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await lookupService.listEmployees(companyId, req.validatedQuery as never);
    res.status(200).json({ data });
  },

  async listStores(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await lookupService.listStores(companyId, req.validatedQuery as never);
    res.status(200).json({ data });
  },

  async listInventories(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await lookupService.listInventories(companyId, req.validatedQuery as never);
    res.status(200).json({ data });
  },
};
