import type { Request, Response } from "express";
import { lookupService } from "../services/lookup.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const lookupController = {
  async listEmployees(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await lookupService.listEmployees(companyId, req.validatedQuery as never);
    res.status(200).json({ data });
  },

  async listServices(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await lookupService.listServices(companyId, req.validatedQuery as never);
    res.status(200).json({ data });
  },

  async listOperations(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await lookupService.listOperations(companyId, req.validatedQuery as never);
    res.status(200).json({ data });
  },
};
